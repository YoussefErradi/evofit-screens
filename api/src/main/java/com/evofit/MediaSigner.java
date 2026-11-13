package com.evofit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Short-lived, scoped media links let ordinary video elements use HTTP range requests. */
@Component
public class MediaSigner {
  private final byte[] secret;

  public MediaSigner(@Value("${evofit.media-signing-key}") String key) {
    if (key == null || key.length() < 32 || key.startsWith("replace-with") || key.equals("change-me"))
      throw new IllegalArgumentException("EVOFIT_MEDIA_SIGNING_KEY must contain at least 32 characters");
    secret = key.getBytes(StandardCharsets.UTF_8);
  }

  public String url(String filename, String subject) {
    // Device links stay stable across polling; admin preview links expire sooner.
    long window = subject.equals("admin") ? 900 : 21600;
    long expiry = ((Instant.now().getEpochSecond() / window) + 2) * window;
    return "/api/media/" + filename + "?subject=" + subject + "&expires=" + expiry
        + "&signature=" + signature(filename, subject, expiry);
  }

  public boolean valid(String filename, String subject, long expiry, String signature) {
    if (subject == null || signature == null || expiry < Instant.now().getEpochSecond()
        || expiry > Instant.now().getEpochSecond() + (subject.equals("admin") ? 1800 : 43200)
        || !signature.matches("[0-9a-f]{64}")) return false;
    return MessageDigest.isEqual(signature.getBytes(StandardCharsets.US_ASCII),
        signature(filename, subject, expiry).getBytes(StandardCharsets.US_ASCII));
  }

  private String signature(String filename, String subject, long expiry) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret, "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal((filename + "|" + subject + "|" + expiry).getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) { throw new IllegalStateException(e); }
  }
}
