-- 用户主动选择的头像需持久化；微信 chooseAvatar 返回的本地临时路径不能直接长期保存。
ALTER TABLE app_user ADD COLUMN avatar_data LONGBLOB;
ALTER TABLE app_user ADD COLUMN avatar_content_type VARCHAR(64);
ALTER TABLE app_user ADD COLUMN avatar_updated_at VARCHAR(19);
