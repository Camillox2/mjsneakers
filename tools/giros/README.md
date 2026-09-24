# Giros 360° da vitrine

Transforma um vídeo de tênis girando (gerado por IA ou filmado num prato
giratório) na sequência de quadros que o site desenha no canvas enquanto a
pessoa rola a página.

Por que quadros e não o MP4 direto: pular o `currentTime` de um vídeo a cada
movimento de rolagem obriga o navegador a decodificar a partir do último
quadro-chave, e o giro engasga (no iPhone, muito). Quadros WebP já
decodificados desenham na hora.

## Preparar (uma vez)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

Na primeira execução o `rembg` baixa o modelo de recorte (cerca de 180 MB).

## Do vídeo ao site

O vídeo ideal: fundo liso de estúdio, o tênis inteiro no quadro, pelo menos
uma volta completa. 10 s a 24 fps funciona bem.

1. **Recortar** o tênis de cada quadro (lento: uns 9 s por quadro no processador).
   `--passo 2` pega um quadro sim, outro não, e basta para vídeos com mais de 200 quadros.

   ```bash
   .venv/Scripts/python cortar.py giro.mp4 mestres/meu-tenis --passo 2
   ```

   Dá para interromper e rodar de novo: quadros prontos são pulados.

   Com placa de vídeo, instale `onnxruntime-directml` no lugar de `rembg[cpu]`
   (`pip install rembg onnxruntime-directml`) e rode com `--gpu`: cerca de 1,3 s
   por quadro numa MX250. Se der erro de caminho longo no Windows, defina
   `NUMBA_CACHE_DIR` para uma pasta curta (ex.: `set NUMBA_CACHE_DIR=C:
b`).

2. **Exportar** para o site. O script acha onde a volta fecha, deixa a
   velocidade do giro constante, estabiliza posição e zoom e gera os WebP.

   ```bash
   .venv/Scripts/python exportar.py mestres/meu-tenis ../../frontend/public/giros/meu-tenis --id meu-tenis
   ```

   `--fundo R,G,B` (a cor do fundo do vídeo, ex.: `--fundo 23,57,112`) tira do
   tênis o reflexo dessa cor, sem mexer nas cores do próprio par. Se a volta for
   detectada no lugar errado, force com `--fim-volta N` (índice do mestre).

   A emenda da volta (`--costura`, 12 quadros) passa da continuação do vídeo
   para o começo por fluxo óptico: a forma anda de uma pose para a outra, sem
   tênis duplicado. Ela precisa dos quadros seguidos logo depois da volta; se
   os mestres foram cortados com `--passo 2`, corte também esse trecho quadro a
   quadro (`cortar.py ... --fim N`, os prontos são pulados). Se a segunda volta
   do vídeo mudar (a câmera deu zoom ou mudou o ângulo, como no Dunk e no AF1),
   o script desliga a costura sozinho e a volta fecha num corte seco: morph
   entre duas cenas diferentes sai borrado.

   `--dobro` põe um quadro do meio (fluxo óptico) entre cada par vizinho no
   computador, mas só onde o fluxo acerta: o script anda um quadro para a
   frente e o outro para trás até o meio e confere se as duas metades
   coincidem. Onde não coincidem (o tênis virando de frente para a câmera),
   fica só o quadro real, que é melhor que um quadro com fantasma. Use no tênis
   que gira sozinho (abertura, órbita): com ~300 quadros ele roda a 60 quadros
   por segundo numa volta de ~5 s. Suba o teto: `--quadros-d 400 --quadros-m 160`
   (o celular fica só com os quadros do vídeo).

   `--intermediarios` preenche com quadros inventados os passos grandes do
   vídeo, sem conferir. Sai fantasma justamente nos ângulos difíceis; evite.

3. **Chamadas** (as linhas que apontam partes do tênis durante o giro):
   escreva um JSON com o trecho da volta e o ponto no quadro do meio do trecho,
   e o script rastreia o ponto quadro a quadro.

   ```json
   [{ "label": "Cadarço de corda", "at": [0.06, 0.2], "anchor": [0.52, 0.28] }]
   ```

   ```bash
   .venv/Scripts/python chamadas.py ../../frontend/public/giros/meu-tenis chamadas.json --previa previa.jpg
   ```

   Confira `previa.jpg` (a bolinha vermelha tem que ficar em cima da peça) e
   copie o `track` impresso para `frontend/src/data/drops.js`.

4. **Cadastrar** o drop em `frontend/src/data/drops.js` (nome, preço, cores do
   mundo, especificações, chamadas). Para ligar ao produto do backend,
   preencha `productId`.

5. Regenerou um giro que já estava no ar? Não precisa fazer nada no cache:
   o `manifest.json` leva um `rev` (assinatura do conteúdo dos quadros), o site
   pede cada quadro com `?v=rev` e o service worker apaga as versões antigas.

## O que sai em `public/giros/<id>/`

- `d/NNN.webp`: todos os quadros da volta para computador, até o teto
  `--quadros-d` (200), até 860 px de largura.
- `m/NNN.webp`: até `--quadros-m` quadros para celular (90; 520 px),
  carregados em telas estreitas, de toque ou com economia de dados ligada.
- `poster.webp`: primeiro quadro (imagem de apoio e de compartilhamento).
- `manifest.json`: tamanhos, largura da sombra por quadro, o croqui
  vetorial (contorno + linhas internas) que se desenha enquanto o giro carrega
  e o `rev` que versiona os quadros no cache do navegador.

Todos os giros saem no mesmo enquadramento 4:3, então órbitas, sombra e
chamadas usam o mesmo sistema de coordenadas em qualquer tênis.
