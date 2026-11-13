package com.evofit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Admin routes require an explicit header, so browsers cannot submit authenticated cross-site forms. */
@Component
public class AdminAccessFilter extends OncePerRequestFilter {
  private final byte[] expected;
  private final ConcurrentHashMap<String, Attempt> attempts = new ConcurrentHashMap<>();
  private final ConcurrentHashMap<String, Long> sessions = new ConcurrentHashMap<>();
  private final SecureRandom random = new SecureRandom();

  public AdminAccessFilter(@Value("${evofit.admin-password}") String password) {
    if (password == null || password.length() < 16 || password.startsWith("replace-with") || password.equals("change-me"))
      throw new IllegalArgumentException("EVOFIT_ADMIN_PASSWORD must contain at least 16 characters");
    expected = password.getBytes(StandardCharsets.UTF_8);
  }

  private record Attempt(int count, long until) {}

  public String login(String password, String ip) {
    long now = Instant.now().getEpochSecond();
    Attempt previous = attempts.get(ip);
    if (previous != null && previous.count >= 10 && previous.until > now) return null;
    byte[] supplied = password == null ? new byte[0] : password.getBytes(StandardCharsets.UTF_8);
    if (supplied.length != expected.length || !MessageDigest.isEqual(supplied, expected)) {
      attempts.compute(ip, (key, old) -> old == null || old.until <= now
          ? new Attempt(1, now + 300) : new Attempt(old.count + 1, old.until));
      return null;
    }
    attempts.remove(ip);
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    sessions.put(token, now + 43200);
    return token;
  }

  public void logout(String token) { if (token != null) sessions.remove(token); }

  @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                             FilterChain chain) throws ServletException, IOException {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    String path = request.getRequestURI();
    if (!path.startsWith("/api/") || path.equals("/api/admin/login") || path.startsWith("/api/player/") || path.startsWith("/api/media/")) {
      chain.doFilter(request, response);
      return;
    }
    long now = Instant.now().getEpochSecond();
    String token = request.getHeader("X-Evofit-Admin");
    Long expiry = token == null ? null : sessions.get(token);
    if (expiry == null || expiry <= now) {
      if (token != null) sessions.remove(token);
      response.sendError(401, "Admin access required");
      return;
    }
    chain.doFilter(request, response);
  }
}
