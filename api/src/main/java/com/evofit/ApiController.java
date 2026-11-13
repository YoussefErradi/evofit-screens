package com.evofit;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api")
public class ApiController {
  private final JdbcTemplate jdbc;
  private final RotationService rotation;
  private final OperatingCalendar calendar;
  private final MediaSigner mediaSigner;
  private final Path mediaDir;
  private final SecureRandom random = new SecureRandom();
  private final ConcurrentHashMap<String, PairAttempts> pairAttempts = new ConcurrentHashMap<>();
  private record PairAttempts(int count, long until) {}

  public ApiController(JdbcTemplate jdbc, RotationService rotation, OperatingCalendar calendar, MediaSigner mediaSigner,
                       @Value("${evofit.media-dir}") String mediaDir) {
    this.jdbc = jdbc;
    this.rotation = rotation;
    this.calendar = calendar;
    this.mediaSigner = mediaSigner;
    this.mediaDir = Path.of(mediaDir).toAbsolutePath().normalize();
  }

  private static String hash(String value) {
    try {
      byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(bytes);
    } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }

  private static UUID uuid(String value) {
    try { return UUID.fromString(value); }
    catch (IllegalArgumentException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ID"); }
  }

  private static String required(String value, String label) {
    if (value == null || value.trim().isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " is required");
    return value.trim();
  }

  private static void found(int updated) {
    if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found");
  }

  private static Map<String, Object> map(Object... values) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1]);
    return result;
  }

  public record ExerciseInput(@NotBlank String title, String instructions, boolean enabled) {}
  public record MemberInput(@NotBlank String fullName, String phone, String email,
                            @NotNull LocalDate startsOn, @NotNull LocalDate expiresOn, String notes) {}
  public record RenewInput(@NotNull LocalDate expiresOn) {}
  public record PairInput(@NotBlank String code) {}
  public record RoundInput(@NotBlank String name) {}
  public record ScreenInput(@NotBlank String name, @NotNull Integer roundId) {}

  private static String displayName(String name) {
    String value = required(name, "Name");
    if (value.length() > 80) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name must be 80 characters or less");
    return value;
  }

  @GetMapping("/dashboard")
  public Map<String, Object> dashboard() {
    LocalDate today = LocalDate.now(OperatingCalendar.ZONE);
    rotation.ensureAll(today);
    int ready = jdbc.queryForObject("SELECT count(*) FROM exercises WHERE enabled AND video_filename IS NOT NULL", Integer.class);
    int totalExercises = jdbc.queryForObject("SELECT count(*) FROM exercises", Integer.class);
    int paired = jdbc.queryForObject("SELECT count(*) FROM screens WHERE token_hash IS NOT NULL", Integer.class);
    int totalScreens = jdbc.queryForObject("SELECT count(*) FROM screens", Integer.class);
    int renewals = jdbc.queryForObject("SELECT count(*) FROM members WHERE expires_on BETWEEN ? AND ?", Integer.class, today, today.plusDays(7));
    int active = jdbc.queryForObject("SELECT count(*) FROM members WHERE starts_on <= ? AND expires_on >= ?", Integer.class, today, today);
    return map("today", today, "timezone", OperatingCalendar.ZONE.toString(),
        "operatingNow", calendar.isOpen(ZonedDateTime.now(OperatingCalendar.ZONE)),
        "opensAt", calendar.opensAt(), "closesAt", calendar.closesAt(),
        "openDays", calendar.openDays(), "readyExercises", ready, "totalExercises", totalExercises,
        "pairedScreens", paired, "totalScreens", totalScreens, "activeMembers", active, "renewalsDue", renewals);
  }

  @GetMapping("/rounds")
  public List<Map<String, Object>> rounds() {
    return jdbc.query("SELECT r.id, r.name, count(e.id) FILTER (WHERE e.enabled AND e.video_filename IS NOT NULL) AS ready_count FROM rounds r LEFT JOIN exercises e ON e.round_id=r.id GROUP BY r.id ORDER BY r.id",
        (rs, row) -> map("id", rs.getInt("id"), "name", rs.getString("name"), "readyCount", rs.getInt("ready_count")));
  }

  @PostMapping("/rounds")
  @Transactional
  public Map<String, Object> createRound(@Valid @RequestBody RoundInput input) {
    String name = displayName(input.name());
    int roundId = jdbc.queryForObject("INSERT INTO rounds(name) VALUES (?) RETURNING id", Integer.class, name);
    jdbc.update("INSERT INTO exercises(id, round_id, position, title) SELECT gen_random_uuid(), ?, p, 'Exercise ' || p FROM generate_series(1, 16) p", roundId);
    UUID screenId = UUID.randomUUID();
    jdbc.update("INSERT INTO screens(id, name, round_id) VALUES (?,?,?)", screenId, "Display " + roundId, roundId);
    return map("roundId", roundId, "screenId", screenId);
  }

  @GetMapping("/rounds/{roundId}/exercises")
  public List<Map<String, Object>> exercises(@PathVariable int roundId) {
    return jdbc.query("SELECT id, position, title, instructions, video_filename, enabled FROM exercises WHERE round_id=? ORDER BY position",
        (rs, row) -> map("id", rs.getObject("id", UUID.class), "position", rs.getInt("position"),
            "title", rs.getString("title"), "instructions", rs.getString("instructions"),
            "videoUrl", rs.getString("video_filename") == null ? null : mediaSigner.url(rs.getString("video_filename"), "admin"),
            "enabled", rs.getBoolean("enabled")), roundId);
  }

  @PutMapping("/exercises/{id}")
  public Map<String, Object> updateExercise(@PathVariable String id, @Valid @RequestBody ExerciseInput input) {
    found(jdbc.update("UPDATE exercises SET title=?, instructions=?, enabled=? WHERE id=?",
        required(input.title(), "Title"), input.instructions() == null ? "" : input.instructions().trim(), input.enabled(), uuid(id)));
    return map("saved", true);
  }

  @PostMapping(value = "/exercises/{id}/video", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> uploadVideo(@PathVariable String id, @RequestPart("file") MultipartFile file) throws IOException {
    UUID exerciseId = uuid(id);
    if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a video file");
    String type = file.getContentType();
    String extension = switch (type == null ? "" : type) {
      case "video/mp4" -> ".mp4";
      case "video/webm" -> ".webm";
      default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use an MP4 or WebM video");
    };
    Integer exists = jdbc.queryForObject("SELECT count(*) FROM exercises WHERE id=?", Integer.class, exerciseId);
    if (exists == null || exists == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
    Files.createDirectories(mediaDir);
    String filename = UUID.randomUUID() + extension;
    Path target = mediaDir.resolve(filename);
    try {
      file.transferTo(target);
      byte[] header;
      try (var input = Files.newInputStream(target)) { header = input.readNBytes(12); }
      boolean valid = extension.equals(".mp4")
          ? header.length >= 8 && new String(header, 4, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("ftyp")
          : header.length >= 4 && (header[0] & 255) == 0x1a && (header[1] & 255) == 0x45
              && (header[2] & 255) == 0xdf && (header[3] & 255) == 0xa3;
      if (!valid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File content is not a valid MP4 or WebM container");
      jdbc.update("UPDATE exercises SET video_filename=? WHERE id=?", filename, exerciseId);
    } catch (IOException | RuntimeException e) {
      Files.deleteIfExists(target);
      throw e;
    }
    return map("videoUrl", mediaSigner.url(filename, "admin"));
  }

  @GetMapping("/media/{filename}")
  public ResponseEntity<Resource> media(@PathVariable String filename, @RequestParam String subject,
                                        @RequestParam long expires, @RequestParam String signature) {
    if (!filename.matches("[0-9a-fA-F-]{36}\\.(mp4|webm)")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    if (!mediaSigner.valid(filename, subject, expires, signature)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    if (!subject.equals("admin")) {
      UUID screenId = uuid(subject);
      Integer paired = jdbc.queryForObject("SELECT count(*) FROM screens WHERE id=? AND token_hash IS NOT NULL", Integer.class, screenId);
      if (paired == null || paired == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
    Path file = mediaDir.resolve(filename);
    if (!Files.isRegularFile(file)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    MediaType type = filename.endsWith(".webm") ? MediaType.parseMediaType("video/webm") : MediaType.parseMediaType("video/mp4");
    return ResponseEntity.ok().contentType(type)
        .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
        .body(new FileSystemResource(file));
  }

  @GetMapping("/rounds/{roundId}/schedule")
  public Map<String, Object> schedule(@PathVariable int roundId) {
    Integer exists = jdbc.queryForObject("SELECT count(*) FROM rounds WHERE id=?", Integer.class, roundId);
    if (exists == null || exists == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Round not found");
    rotation.ensureRound(roundId, LocalDate.now(OperatingCalendar.ZONE));
    List<Map<String, Object>> cycles = jdbc.query("SELECT id, cycle_number, start_date, end_date FROM rotation_cycles WHERE round_id=? ORDER BY cycle_number DESC LIMIT 2",
        (rs, row) -> map("id", rs.getObject("id", UUID.class), "number", rs.getInt("cycle_number"),
            "startDate", rs.getDate("start_date").toLocalDate(), "endDate", rs.getDate("end_date").toLocalDate()), roundId);
    List<Map<String, Object>> days = new ArrayList<>();
    for (Map<String, Object> cycle : cycles) {
      days.addAll(jdbc.query("SELECT d.operating_date, d.day_number, u.title AS upper_title, l.title AS lower_title, u.video_filename AS upper_video, l.video_filename AS lower_video FROM rotation_days d JOIN exercises u ON u.id=d.upper_exercise_id JOIN exercises l ON l.id=d.lower_exercise_id WHERE d.cycle_id=? ORDER BY d.day_number",
          (rs, row) -> map("cycleNumber", cycle.get("number"), "date", rs.getDate("operating_date").toLocalDate(),
              "dayNumber", rs.getInt("day_number"), "upperTitle", rs.getString("upper_title"), "lowerTitle", rs.getString("lower_title"),
              "upperVideoUrl", rs.getString("upper_video") == null ? null : mediaSigner.url(rs.getString("upper_video"), "admin"),
              "lowerVideoUrl", rs.getString("lower_video") == null ? null : mediaSigner.url(rs.getString("lower_video"), "admin")), cycle.get("id")));
    }
    return map("cycles", cycles, "days", days);
  }

  @PostMapping("/rounds/{roundId}/schedule/prepare")
  public Map<String, Object> prepare(@PathVariable int roundId) { return schedule(roundId); }

  @GetMapping("/screens")
  public List<Map<String, Object>> screens() {
    return jdbc.query("SELECT s.id, s.name, s.round_id, s.token_hash, s.last_seen_at, r.name AS round_name FROM screens s JOIN rounds r ON r.id=s.round_id ORDER BY s.round_id, s.name, s.id",
        (rs, row) -> map("id", rs.getObject("id", UUID.class), "name", rs.getString("name"),
            "roundId", rs.getInt("round_id"), "roundName", rs.getString("round_name"),
            "paired", rs.getString("token_hash") != null, "lastSeenAt", rs.getTimestamp("last_seen_at") == null ? null : rs.getTimestamp("last_seen_at").toInstant()));
  }

  @PostMapping("/screens")
  public Map<String, Object> createScreen(@Valid @RequestBody ScreenInput input) {
    UUID id = UUID.randomUUID();
    int inserted = jdbc.update("INSERT INTO screens(id, name, round_id) SELECT ?, ?, id FROM rounds WHERE id=?",
        id, displayName(input.name()), input.roundId());
    if (inserted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Round not found");
    return map("id", id, "roundId", input.roundId());
  }

  @PostMapping("/screens/{id}/pairing-code")
  public Map<String, Object> pairingCode(@PathVariable String id) {
    Instant expires = Instant.now().plusSeconds(600);
    UUID screenId = uuid(id);
    for (int i = 0; i < 10; i++) {
      String code = String.format("%06d", random.nextInt(1_000_000));
      try {
        found(jdbc.update("UPDATE screens SET pairing_code_hash=?, pairing_expires_at=? WHERE id=?",
            hash(code), java.sql.Timestamp.from(expires), screenId));
        return map("code", code, "expiresAt", expires);
      } catch (DuplicateKeyException collision) { /* A different screen has this code; retry. */ }
    }
    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not issue a unique pairing code");
  }

  @PostMapping("/screens/{id}/unpair")
  public Map<String, Object> unpair(@PathVariable String id) {
    found(jdbc.update("UPDATE screens SET token_hash=NULL, pairing_code_hash=NULL, pairing_expires_at=NULL, last_seen_at=NULL WHERE id=?", uuid(id)));
    return map("unpaired", true);
  }

  @PostMapping("/player/pair")
  public Map<String, Object> pair(@Valid @RequestBody PairInput input, HttpServletRequest request) {
    long now = Instant.now().getEpochSecond();
    PairAttempts attempt = pairAttempts.compute(request.getRemoteAddr(), (ip, old) -> old == null || old.until() <= now
        ? new PairAttempts(1, now + 600) : new PairAttempts(old.count() + 1, old.until()));
    if (attempt.count() > 10) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many pairing attempts");
    if (!input.code().matches("[0-9]{6}")) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid pairing code");
    List<Map<String, Object>> matches = jdbc.queryForList(
        "SELECT id, round_id, name FROM screens WHERE pairing_code_hash=? AND pairing_expires_at>now()", hash(input.code().trim()));
    if (matches.size() != 1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired pairing code");
    Map<String, Object> screen = matches.getFirst();
    byte[] bytes = new byte[32]; random.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    int claimed = jdbc.update("UPDATE screens SET token_hash=?, pairing_code_hash=NULL, pairing_expires_at=NULL WHERE id=? AND pairing_code_hash=? AND pairing_expires_at>now()",
        hash(token), screen.get("id"), hash(input.code().trim()));
    if (claimed != 1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Pairing code was already used");
    return map("token", token, "screenId", screen.get("id"), "roundId", screen.get("round_id"), "name", screen.get("name"));
  }

  @GetMapping("/player/content")
  public Map<String, Object> playerContent(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
    if (authorization == null || !authorization.startsWith("Bearer ")) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    String token = authorization.substring(7);
    List<Map<String, Object>> matches = jdbc.queryForList("SELECT id, round_id, name FROM screens WHERE token_hash=?", hash(token));
    if (matches.size() != 1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    Map<String, Object> screen = matches.getFirst();
    jdbc.update("UPDATE screens SET last_seen_at=now() WHERE id=?", screen.get("id"));
    int roundId = ((Number) screen.get("round_id")).intValue();
    LocalDate today = LocalDate.now(OperatingCalendar.ZONE);
    rotation.ensureRound(roundId, today);
    boolean open = calendar.isOpen(ZonedDateTime.now(OperatingCalendar.ZONE));
    List<Map<String, Object>> todayContent = jdbc.query(
        "SELECT d.day_number, c.cycle_number, u.title AS upper_title, u.instructions AS upper_instructions, u.video_filename AS upper_video, l.title AS lower_title, l.instructions AS lower_instructions, l.video_filename AS lower_video FROM rotation_days d JOIN rotation_cycles c ON c.id=d.cycle_id JOIN exercises u ON u.id=d.upper_exercise_id JOIN exercises l ON l.id=d.lower_exercise_id WHERE c.round_id=? AND d.operating_date=?",
        (rs, row) -> map("dayNumber", rs.getInt("day_number"), "cycleNumber", rs.getInt("cycle_number"),
            "upper", map("title", rs.getString("upper_title"), "instructions", rs.getString("upper_instructions"), "videoUrl", mediaSigner.url(rs.getString("upper_video"), screen.get("id").toString())),
            "lower", map("title", rs.getString("lower_title"), "instructions", rs.getString("lower_instructions"), "videoUrl", mediaSigner.url(rs.getString("lower_video"), screen.get("id").toString()))), roundId, today);
    return map("screenId", screen.get("id"), "screenName", screen.get("name"), "roundId", roundId,
        "roundName", jdbc.queryForObject("SELECT name FROM rounds WHERE id=?", String.class, roundId),
        "today", today, "timezone", OperatingCalendar.ZONE.toString(), "operatingNow", open,
        "opensAt", calendar.opensAt(), "closesAt", calendar.closesAt(), "openDays", calendar.openDays(),
        "content", todayContent.isEmpty() ? null : todayContent.getFirst());
  }

  @GetMapping("/members")
  public List<Map<String, Object>> members() {
    LocalDate today = LocalDate.now(OperatingCalendar.ZONE);
    return jdbc.query("SELECT id, full_name, phone, email, starts_on, expires_on, notes FROM members ORDER BY expires_on, full_name",
        (rs, row) -> {
          LocalDate starts = rs.getDate("starts_on").toLocalDate();
          LocalDate expires = rs.getDate("expires_on").toLocalDate();
          String status = today.isBefore(starts) ? "Upcoming" : today.isAfter(expires) ? "Expired" : !expires.isAfter(today.plusDays(7)) ? "Renew soon" : "Active";
          return map("id", rs.getObject("id", UUID.class), "fullName", rs.getString("full_name"),
              "phone", rs.getString("phone"), "email", rs.getString("email"), "startsOn", starts,
              "expiresOn", expires, "notes", rs.getString("notes"), "status", status);
        });
  }

  private static void validateDates(MemberInput input) {
    if (input.expiresOn().isBefore(input.startsOn())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Expiry must be on or after start date");
  }

  @PostMapping("/members")
  public Map<String, Object> createMember(@Valid @RequestBody MemberInput input) {
    validateDates(input);
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO members(id, full_name, phone, email, starts_on, expires_on, notes) VALUES (?,?,?,?,?,?,?)",
        id, required(input.fullName(), "Name"), nullToEmpty(input.phone()), nullToEmpty(input.email()),
        input.startsOn(), input.expiresOn(), nullToEmpty(input.notes()));
    return map("id", id);
  }

  @PutMapping("/members/{id}")
  public Map<String, Object> updateMember(@PathVariable String id, @Valid @RequestBody MemberInput input) {
    validateDates(input);
    found(jdbc.update("UPDATE members SET full_name=?, phone=?, email=?, starts_on=?, expires_on=?, notes=? WHERE id=?",
        required(input.fullName(), "Name"), nullToEmpty(input.phone()), nullToEmpty(input.email()),
        input.startsOn(), input.expiresOn(), nullToEmpty(input.notes()), uuid(id)));
    return map("saved", true);
  }

  @PostMapping("/members/{id}/renew")
  public Map<String, Object> renew(@PathVariable String id, @Valid @RequestBody RenewInput input) {
    UUID memberId = uuid(id);
    List<LocalDate> current = jdbc.query("SELECT expires_on FROM members WHERE id=?",
        (rs, row) -> rs.getDate(1).toLocalDate(), memberId);
    if (current.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    if (!input.expiresOn().isAfter(current.getFirst())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New expiry must be after the current expiry");
    if (jdbc.update("UPDATE members SET expires_on=? WHERE id=? AND expires_on=?", input.expiresOn(), memberId, current.getFirst()) == 0)
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Membership changed; refresh before renewing");
    return map("saved", true);
  }

  private static String nullToEmpty(String value) { return value == null ? "" : value.trim(); }
}
