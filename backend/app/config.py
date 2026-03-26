from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    supabase_jwt_aud: str = "authenticated"

    # IPFS / Pinata
    pinata_api_key: str = ""
    pinata_api_secret: str = ""
    pinata_gateway_base: str = "https://gateway.pinata.cloud/ipfs"

    # Encryption
    document_encryption_key_b64: str = ""

    # Blockchain
    blockchain_rpc_url: str = ""
    blockchain_private_key: str = ""
    blockchain_account_address: str = ""
    blockchain_contract_address: str = ""
    blockchain_contract_abi_path: str = "app/blockchain_abi/DocumentRegistry.json"
    blockchain_chain_name: str = "polygon-amoy"

    alert_dedup_seconds: int = 180
    nearby_alerts_default_radius_m: int = 5000

    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()

