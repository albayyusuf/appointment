-- Firma iletişim telefonu (isteğe bağlı)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "phone" TEXT;
