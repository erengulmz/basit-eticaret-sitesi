# Foto 1 Video Pipeline

Bu proje, tek bir foto 1 a 1f 1daki ad 1mlarla k 1sa bir videoya d 6n 6fc 5ft 5cr 5cr:
- Yandaki teknenin inpainting ile kald 1r 1lmas 1
- Y 6fz hatlar 1n 1 bozmadan ki 5fiyi biraz suyun 6fczerine 6e7 1karma ve arkay 6fz 6fc doldurma
- Dalgalar 1n hafif hareketlendirilmesi
- Ba 5f a 6e7 1s 1n 1n zamana yay 1larak normale yak 1nla 5ft 1r 1lmas 1
- 6dcstte mart 1lar 1n ge 6e7mesi

## Kurulum
1. Python 3.10+ kurulu olmal 1.
2. Sanal ortam (opsiyonel):
```bash
python -m venv .venv && source .venv/bin/activate
```
3. Ba 1f 1ml 1klar 1 y 6fckleyin:
```bash
pip install -r requirements.txt
```

## Dosya yerleri
- Giri 5f foto 1fra 1: `photo2video/assets/input.jpg` (bu dosyay 1 siz kopyalay 1n)
- Opsiyonel tekne maskesi: `photo2video/masks/boat_mask.png` (beyaz=tekne, siyah=di 1fer)

## 6c7al 1 5ft 1rma
```bash
python main.py --input assets/input.jpg --out output/final.mp4 --fps 24 --seconds 6
```

Ek parametreler:
```bash
python main.py \
  --boat-mask masks/boat_mask.png \
  --raise-px 25 \
  --wave-amp 2.0 \
  --head-smooth 0.85
```

Notlar:
- Maske vermedi 1finiz durumda kod tekneyi basit bir sol-taraf heuristi 1fi ile deneyecek; en iyi sonu 6e7 i 6e7in maske 6fnerilir.
- Video olu 5ftu 1funda `output/final.mp4` dosyas 1nda olacakt 1r.