PWA 아이콘 생성 안내
===================

icon.svg 파일을 기반으로 아래 두 파일을 생성해야 합니다:
  - icon-192.png  (192×192 px)
  - icon-512.png  (512×512 px)

생성 방법:
1. https://svgtopng.com 에서 icon.svg 업로드 후 변환
2. 또는 macOS에서: rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
3. 또는 Inkscape: inkscape icon.svg -w 512 -o icon-512.png

배포 전에 반드시 두 PNG 파일을 이 폴더에 추가하세요.
