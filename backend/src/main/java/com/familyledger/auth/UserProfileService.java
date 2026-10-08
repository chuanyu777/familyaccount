package com.familyledger.auth;

import com.familyledger.common.ApiException;
import com.familyledger.common.Time;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class UserProfileService {
  public static final int MAX_AVATAR_BYTES = 2 * 1024 * 1024;
  private static final List<String> AVATAR_TYPES = List.of("image/jpeg", "image/png", "image/webp");
  private final JdbcTemplate db;

  public UserProfileService(JdbcTemplate db) {
    this.db = db;
  }

  public Map<String, Object> get(long userId) {
    Map<String, Object> row = db.queryForMap(
        "SELECT id, display_name, avatar_updated_at, "
            + "CASE WHEN avatar_data IS NULL THEN 0 ELSE 1 END AS has_avatar "
            + "FROM app_user WHERE id = ?", userId);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("userId", ((Number) row.get("id")).longValue());
    result.put("displayName", String.valueOf(row.get("display_name")));
    boolean hasAvatar = ((Number) row.get("has_avatar")).intValue() == 1;
    result.put("avatarUrl", hasAvatar
        ? "/api/profile/" + userId + "/avatar?v=" + String.valueOf(row.get("avatar_updated_at"))
        : null);
    return result;
  }

  public Map<String, Object> updateName(long userId, String displayName) {
    String name = displayName == null ? "" : displayName.trim();
    if (name.isEmpty() || name.length() > 50) {
      throw ApiException.badRequest("VALIDATION_FAILED", "昵称需为 1-50 个字符");
    }
    db.update("UPDATE app_user SET display_name = ? WHERE id = ?", name, userId);
    return get(userId);
  }

  public Map<String, Object> updateAvatar(long userId, byte[] bytes, String contentType) {
    if (bytes == null || bytes.length == 0 || bytes.length > MAX_AVATAR_BYTES) {
      throw ApiException.badRequest("INVALID_AVATAR", "头像需为不超过 2MB 的图片");
    }
    String type = contentType == null ? "" : contentType.toLowerCase();
    if (!AVATAR_TYPES.contains(type)) {
      throw ApiException.badRequest("INVALID_AVATAR", "仅支持 JPG、PNG 或 WebP 头像");
    }
    db.update("UPDATE app_user SET avatar_data = ?, avatar_content_type = ?, avatar_updated_at = ? WHERE id = ?",
        bytes, type, Time.now(), userId);
    return get(userId);
  }

  public Avatar avatar(long userId) {
    List<Avatar> rows = db.query(
        "SELECT avatar_data, avatar_content_type FROM app_user WHERE id = ? AND avatar_data IS NOT NULL",
        (rs, index) -> new Avatar(rs.getBytes("avatar_data"), rs.getString("avatar_content_type")), userId);
    if (rows.isEmpty()) throw ApiException.notFound("AVATAR_NOT_FOUND", "头像不存在");
    return rows.get(0);
  }

  public record Avatar(byte[] bytes, String contentType) {}
}
