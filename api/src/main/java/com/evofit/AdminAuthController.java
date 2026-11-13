package com.evofit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
public class AdminAuthController {
  private final AdminAccessFilter access;

  public AdminAuthController(AdminAccessFilter access) { this.access = access; }

  public record Login(@NotBlank String password) {}

  @PostMapping("/login")
  public Map<String, String> login(@Valid @RequestBody Login input, HttpServletRequest request) {
    String token = access.login(input.password(), request.getRemoteAddr());
    if (token == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid password or too many attempts");
    return Map.of("token", token);
  }

  @PostMapping("/logout")
  public Map<String, Boolean> logout(@RequestHeader("X-Evofit-Admin") String token) {
    access.logout(token);
    return Map.of("signedOut", true);
  }
}
