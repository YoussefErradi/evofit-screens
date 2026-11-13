package com.evofit;

import java.security.SecureRandom;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RotationService {
  private final JdbcTemplate jdbc;
  private final OperatingCalendar calendar;
  private final TransactionTemplate transactions;
  private final SecureRandom random = new SecureRandom();

  public RotationService(JdbcTemplate jdbc, OperatingCalendar calendar, PlatformTransactionManager manager) {
    this.jdbc = jdbc;
    this.calendar = calendar;
    this.transactions = new TransactionTemplate(manager);
  }

  public static List<List<UUID>> pairs(List<UUID> exercises, java.util.Random random) {
    if (exercises.size() != 16 || exercises.stream().distinct().count() != 16)
      throw new IllegalArgumentException("A cycle needs 16 distinct exercises");
    List<UUID> shuffled = new ArrayList<>(exercises);
    Collections.shuffle(shuffled, random);
    List<List<UUID>> result = new ArrayList<>();
    for (int i = 0; i < 16; i += 2) result.add(List.of(shuffled.get(i), shuffled.get(i + 1)));
    return result;
  }

  @Scheduled(cron = "0 1 0 * * *", zone = "Africa/Casablanca")
  public void prepareDaily() { ensureAll(LocalDate.now(OperatingCalendar.ZONE)); }

  public void ensureAll(LocalDate today) {
    List<Integer> roundIds = jdbc.queryForList("SELECT id FROM rounds ORDER BY id", Integer.class);
    for (int roundId : roundIds) ensureRound(roundId, today);
  }

  public void ensureRound(int roundId, LocalDate today) {
    transactions.executeWithoutResult(status -> ensureRoundLocked(roundId, today));
  }

  private void ensureRoundLocked(int roundId, LocalDate today) {
    // A transaction-scoped database lock keeps concurrent API/device requests from creating duplicate cycles.
    jdbc.queryForList("SELECT pg_advisory_xact_lock(?)", roundId);
    List<UUID> ready = jdbc.query(
        "SELECT id FROM exercises WHERE round_id = ? AND enabled AND video_filename IS NOT NULL ORDER BY position",
        (rs, row) -> rs.getObject(1, UUID.class), roundId);
    if (ready.size() != 16) return;

    List<Map<String, Object>> latest = jdbc.queryForList(
        "SELECT cycle_number, end_date FROM rotation_cycles WHERE round_id = ? ORDER BY cycle_number DESC LIMIT 1",
        roundId);
    int number = latest.isEmpty() ? 0 : ((Number) latest.getFirst().get("cycle_number")).intValue();
    LocalDate lastEnd = latest.isEmpty() ? null : ((Date) latest.getFirst().get("end_date")).toLocalDate();
    if (lastEnd != null && lastEnd.isAfter(today)) return;

    // Catch up from the last persisted day. A new cycle is prepared on day eight.
    do {
      LocalDate start = calendar.nextOperatingDay(lastEnd == null ? today : lastEnd.plusDays(1));
      List<LocalDate> dates = calendar.cycleDates(start);
      List<List<UUID>> slots = pairs(ready, random);
      UUID cycleId = UUID.randomUUID();
      jdbc.update("INSERT INTO rotation_cycles(id, round_id, cycle_number, start_date, end_date) VALUES (?,?,?,?,?)",
          cycleId, roundId, ++number, dates.getFirst(), dates.getLast());
      for (int i = 0; i < 8; i++) {
        jdbc.update("INSERT INTO rotation_days(cycle_id, operating_date, day_number, upper_exercise_id, lower_exercise_id) VALUES (?,?,?,?,?)",
            cycleId, dates.get(i), i + 1, slots.get(i).get(0), slots.get(i).get(1));
      }
      lastEnd = dates.getLast();
    } while (lastEnd.isBefore(today));
  }
}
