from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    supabase_jwt_aud: str = "authenticated"

    alert_dedup_seconds: int = 180
    nearby_alerts_default_radius_m: int = 5000

    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()

