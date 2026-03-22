# Stripe kurulumu

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Developers → API keys**: Secret (`sk_test_…`) ve Publishable (`pk_test_…`).
2. **Ürünler**: Her paket için bir Stripe Product oluşturun; altında **aylık / yıllık abonelik fiyatları** (Price) tanımlayın.
3. `apps/api/.env` dosyasını oluşturun (`apps/api/.env.example` şablonu):

   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

4. Süper admin → **Paketler**: Tabloda **Stripe ürün (`prod_…`)** ve isteğe bağlı **Stripe fiyat (`price_…`)** alanları.  
   - Sadece `prod_` yeterliyse, sunucu ürünün aktif recurring fiyatlarından planın interval’ine uygun olanı seçer.  
   - Belirli bir fiyatı sabitlemek için `price_…` girin (önceliklidir).

**Güvenlik:** API anahtarlarını asla git’e commit etmeyin. Sohbet veya ekranda paylaşılan anahtarları **Stripe panelinden rotate** edin.
