CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY,
	"credential_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
