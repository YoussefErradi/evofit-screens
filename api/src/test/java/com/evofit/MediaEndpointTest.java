package com.evofit;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.mock;

class MediaEndpointTest {
  @TempDir Path mediaDir;

  @Test void signedMediaSupportsRangeAndRejectsTampering() throws Exception {
    String filename = "78ee0e15-bace-460e-900a-cc001224e417.mp4";
    Files.write(mediaDir.resolve(filename), new byte[] {1, 2, 3, 4, 5, 6});
    var signer = new MediaSigner("a-test-only-signing-key-with-at-least-32-characters");
    var calendar = new OperatingCalendar("MONDAY", "06:00", "22:00");
    var controller = new ApiController(mock(JdbcTemplate.class), mock(RotationService.class), calendar, signer, mediaDir.toString());
    var mvc = MockMvcBuilders.standaloneSetup(controller).build();
    mvc.perform(get(signer.url(filename, "admin")).header("Range", "bytes=0-3"))
        .andExpect(status().isPartialContent()).andExpect(content().bytes(new byte[] {1, 2, 3, 4}));
    mvc.perform(get(signer.url(filename, "admin").replace("subject=admin", "subject=other")))
        .andExpect(status().isForbidden());
  }
}
