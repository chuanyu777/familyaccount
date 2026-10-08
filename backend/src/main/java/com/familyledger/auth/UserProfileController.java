package com.familyledger.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/profile")
public class UserProfileController {
  private final UserProfileService service;
  private final AuthGuard guard;

  public UserProfileController(UserProfileService service, AuthGuard guard) {
    this.service = service;
    this.guard = guard;
  }

  @GetMapping
  public Map<String, Object> get(HttpServletRequest request) {
    return service.get(guard.requireLedgerUser(request).userId());
  }

  @PatchMapping
  public Map<String, Object> update(HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    Object value = body == null ? null : body.get("displayName");
    return service.updateName(guard.requireLedgerUser(request).userId(),
        value == null ? null : String.valueOf(value));
  }

  @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> uploadAvatar(HttpServletRequest request,
      @RequestParam("file") MultipartFile file) throws IOException {
    return service.updateAvatar(guard.requireLedgerUser(request).userId(), file.getBytes(), file.getContentType());
  }

  @GetMapping("/{userId}/avatar")
  public ResponseEntity<byte[]> avatar(@PathVariable long userId) {
    UserProfileService.Avatar avatar = service.avatar(userId);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(avatar.contentType()))
        .cacheControl(CacheControl.noCache())
        .body(avatar.bytes());
  }
}
