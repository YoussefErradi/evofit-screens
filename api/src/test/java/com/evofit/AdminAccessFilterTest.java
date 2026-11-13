package com.evofit;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AdminAccessFilterTest {
  @Test void adminRoutesRequireSessionAndPlayerCannotUseAdminSession() throws Exception {
    var filter = new AdminAccessFilter("a-test-only-admin-password");
    var denied = new MockHttpServletResponse();
    filter.doFilter(new MockHttpServletRequest("GET", "/api/members"), denied, new MockFilterChain());
    assertEquals(401, denied.getStatus());

    String token = filter.login("a-test-only-admin-password", "127.0.0.1");
    assertNotNull(token);
    var allowedRequest = new MockHttpServletRequest("GET", "/api/members");
    allowedRequest.addHeader("X-Evofit-Admin", token);
    var allowed = new MockHttpServletResponse();
    filter.doFilter(allowedRequest, allowed, new MockFilterChain());
    assertEquals(200, allowed.getStatus());

    filter.logout(token);
    var revoked = new MockHttpServletResponse();
    filter.doFilter(allowedRequest, revoked, new MockFilterChain());
    assertEquals(401, revoked.getStatus());
  }

  @Test void repeatedBadLoginsAreBlocked() {
    var filter = new AdminAccessFilter("a-test-only-admin-password");
    for (int i = 0; i < 10; i++) assertNull(filter.login("bad", "127.0.0.2"));
    assertNull(filter.login("a-test-only-admin-password", "127.0.0.2"));
  }
}
