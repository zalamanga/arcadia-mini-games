CREATE TABLE arcadia_demo_meta (
  id TINYINT NOT NULL PRIMARY KEY, application VARCHAR(64) NOT NULL,
  schema_version INT NOT NULL, state VARCHAR(20) NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE arcadia_write_guard (id TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE, email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL, avatar VARCHAR(2) NOT NULL DEFAULT 'P1',
  role ENUM('user','admin') NOT NULL DEFAULT 'user', version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, revoked_at BIGINT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id), INDEX idx_sessions_user(user_id,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE games (
  id VARCHAR(40) NOT NULL PRIMARY KEY, name VARCHAR(80) NOT NULL, category VARCHAR(20) NOT NULL,
  difficulty VARCHAR(20) NOT NULL, description VARCHAR(255) NOT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE scores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, game_id VARCHAR(40) NOT NULL,
  score INT UNSIGNED NOT NULL, duration INT UNSIGNED NOT NULL,
  result ENUM('win','loss','draw','complete') NOT NULL, created_at BIGINT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(game_id) REFERENCES games(id),
  INDEX idx_scores_game_score(game_id,score), INDEX idx_scores_user_created(user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE game_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, score_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL, game_id VARCHAR(40) NOT NULL, score INT UNSIGNED NOT NULL,
  duration INT UNSIGNED NOT NULL, result ENUM('win','loss','draw','complete') NOT NULL, created_at BIGINT NOT NULL,
  FOREIGN KEY(score_id) REFERENCES scores(id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(game_id) REFERENCES games(id),
  INDEX idx_game_sessions_user(user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE achievements (
  id VARCHAR(40) NOT NULL PRIMARY KEY, name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL, requirement VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE user_achievements (
  user_id BIGINT UNSIGNED NOT NULL, achievement_id VARCHAR(40) NOT NULL, unlocked_at BIGINT NOT NULL,
  PRIMARY KEY(user_id,achievement_id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(achievement_id) REFERENCES achievements(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE operation_receipts (
  user_id BIGINT UNSIGNED NOT NULL, operation_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action VARCHAR(32) NOT NULL, intent_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status SMALLINT NOT NULL, response_json TEXT NOT NULL, created_at BIGINT NOT NULL,
  PRIMARY KEY(user_id,operation_key), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE rate_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  window_start BIGINT NOT NULL, hits INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
