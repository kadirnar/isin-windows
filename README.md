# Işın for Windows

[Işın](https://github.com/kadirnar/isin)'ın Windows sürümü: Raycast tarzı, **yalnızca yerelde çalışan** klavye başlatıcısı.
macOS sürümü Swift/SwiftUI ile yazılmıştır; bu port **Tauri 2** (Rust arka uç + React/TypeScript arayüz) kullanır.
AI özellikleri kendi **OpenRouter** anahtarınızla çalışır.

> Durum: **0.1 — çekirdek MVP.** macOS sürümündeki 240+ komutun Windows'ta anlamlı olan çekirdeği taşındı;
> kalanlar aşağıdaki yol haritasında.

## Kullanım

| Kısayol | İşlev |
|---|---|
| **Alt+Space** | Işın'ı aç/kapat (Ayarlar → General'dan değiştirilebilir) |
| ↵ / Ctrl+↵ | Birincil / ikincil aksiyon |
| **Ctrl+K** | Tüm aksiyonlar |
| **Tab** | Yazdığınızı Quick AI'a sor |
| Esc / Ctrl+Esc | Aramayı temizle → geri → kapat / kök aramaya dön |
| Ctrl+Shift+F | Favorilere ekle/çıkar |
| Ctrl+, | Ayarlar |
| ↑ (boş aramada) | Son sorgu |

Kök aramada doğrudan hesap yapabilirsiniz: `2+2*3`, `20% of 150`, `10 km to mi`, `100 usd to try`, `$10 to eur`,
`255 to hex`, `0xff`, `time in tokyo`, `bugün + 1 hafta`, `3 days ago`, `2rem to px`.
Quicklink alias'ı + sorgu: `g kediler`, `yt lofi`, `gh tauri`. `>` ile başlayan sorgu komutu terminalde çalıştırır.

## Özellikler (0.1)

- **Çekirdek:** fuzzy arama (ı/İ/ç/ş farkında, macOS sürümünden birebir port), frecency önerileri ve sorgu bazlı öğrenme,
  favoriler, alias'lar, komutları açma/kapama, fallback komutları (Ask AI, Google, dosya arama), 5 tema + sistem teması,
  tepsi simgesi, oturum açınca başlatma, tek örnek.
- **Uygulamalar:** Başlat menüsü kısayolları + Microsoft Store uygulamaları, shell'den alınan ikonlar (önbellekli),
  yönetici olarak çalıştırma, Explorer'da gösterme.
- **Hesap makinesi:** ifadeler, fonksiyonlar, yüzdeler, birimler (uzunluk, kütle, hacim, sıcaklık, zaman, veri, alan, hız,
  açı, CSS), döviz (Coinbase kurları, saatlik), tabanlar, saat dilimleri, tarih aritmetiği (Türkçe kelimelerle de).
- **Clipboard History:** metin geçmişi (1000 kayıt), önizleme + metadata, sabitleme, yapıştırma; parola yöneticilerinin
  gizli işaretlediği kopyalar kaydedilmez.
- **Snippets:** yer tutucular (`{clipboard}`, `{date format="…" offset="+1d"}`, `{cursor}`, `{argument}`, `| uppercase`…),
  anahtar kelimeyle bulma, argüman formu.
- **Quicklinks:** `{query}` argümanlı bağlantılar, alias ile doğrudan sorgu; hazır web aramaları.
- **Sistem:** kilitle, uyku, hazırda beklet, yeniden başlat, kapat, oturumu kapat (onaylı), Geri Dönüşüm Kutusu'nu boşalt,
  açık/koyu mod, ses ve medya tuşları, masaüstünü göster, emoji paneli, ekran alıntısı, Görev Yöneticisi, 16 Windows
  Ayarlar sayfası.
- **Pencere yönetimi:** yarımlar, çeyrekler, üçte birler, dörtte birler, ortala, büyüt, neredeyse büyüt, sonraki/önceki ekran
  (görünmez pencere kenarlıkları hesaba katılır).
- **AI (OpenRouter):** Quick AI (Tab), AI Chat (geçmişli), 12 hazır AI komutu (seçili metin → yoksa pano),
  yanıtı yapıştır/kopyala, sohbete devam et, model seçimi.

## Kurulum

[Releases](https://github.com/kadirnar/isin-windows/releases) sayfasındaki `.msi` veya `-setup.exe` dosyasını kurun
ya da kaynaktan derleyin.

## Geliştirme

Gereksinimler: Node 20+, Rust (MSVC), Visual Studio Build Tools (C++), WebView2 (Windows 11'de hazır).

```bash
npm install
npm test                 # çekirdek mantık birim testleri (fuzzy, frecency, hesap makinesi, yer tutucular)
npm run tauri dev        # geliştirme modu
npm run tauri build      # src-tauri/target/release/bundle altında .msi ve NSIS kurulum dosyası
```

- Proje yolu çok uzunsa (MAX_PATH) MSVC bağlayıcısı `LNK1104` verir; `CARGO_TARGET_DIR` ile kısa bir klasör kullanın.
- `ISIN_DATA_DIR=C:\tmp\isin-test` ile ayrı bir veri klasörüyle çalıştırabilirsiniz.
  Varsayılan veri klasörü: `%APPDATA%\Isin` (düz JSON dosyaları).
- OpenRouter anahtarı Ayarlar → AI'dan girilir; derlemede `VITE_OPENROUTER_API_KEY` ortam değişkeniyle de verilebilir
  (git'e girmez).

### Mimari

| Katman | Dosyalar |
|---|---|
| Rust (OS tarafı) | `src-tauri/src/lib.rs` (pencere, kısayol, tepsi), `apps.rs`, `clipboard.rs`, `system.rs`, `win32.rs`, `store.rs` |
| Çekirdek mantık (TS, test edilir) | `src/core/` — `fuzzy.ts`, `frecency.ts`, `calculator.ts`, `units.ts`, `placeholders.ts`, `openrouter.ts` |
| Arayüz | `src/launcher/` (kök arama, ekranlar, aksiyon paneli), `src/settings/` |

## Yol haritası (macOS sürümünde olup henüz taşınmayanlar)

Snippet anahtar kelimesinin her uygulamada otomatik genişletilmesi (klavye kancası), resimli pano geçmişi, File Search
(Windows Search dizini), Notes, Focus, Switch Windows, Emoji arama ekranı, Dictionary, Translate, Calendar/Contacts,
Script Commands, Raycast eklenti runtime'ı ve Store, AI Agents/Memory/Automations/MCP, Dictation ve Voice,
Theme Studio, Hyper Key, komut başına global kısayollar.
