package com.evofit;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class MediaSignerTest {
  @Test void linkIsScopedTamperResistantAndExpires() {
    var signer = new MediaSigner("a-test-only-signing-key-with-at-least-32-characters");
    String filename = "78ee0e15-bace-460e-900a-cc001224e417.mp4";
    String url = signer.url(filename, "screen-1");
    String query = URI.create(url).getQuery();
    long expires = Long.parseLong(query.split("expires=")[1].split("&")[0]);
    String signature = query.split("signature=")[1];
    assertTrue(signer.valid(filename, "screen-1", expires, signature));
    assertFalse(signer.valid(filename, "screen-2", expires, signature));
    assertFalse(signer.valid(filename.replace(".mp4", ".webm"), "screen-1", expires, signature));
    assertFalse(signer.valid(filename, "screen-1", Instant.now().minusSeconds(1).getEpochSecond(), signature));
  }
}
