"""Regenerate the downloadable single-file edition from dist."""
from pathlib import Path
import base64
root=Path(__file__).resolve().parent
def uri(text):return 'data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
urls={}
for name in ['assets/three.module.js','track-editor.js','cars.js','car-details.js','engine.js','app.js']:
    text=(root/'dist'/name).read_text()
    if name=='app.js': text=text.replace("if('serviceWorker' in navigator &&", "if(false && 'serviceWorker' in navigator &&")
    for dep,url in urls.items():text=text.replace("'./"+dep+"'", "'"+url+"'")
    urls[name]=uri(text)
html=(root/'dist/index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'dist/styles.css').read_text()+'</style>').replace('src="app.js"','src="'+urls['app.js']+'"')
html=html.replace('<link rel="manifest" href="manifest.webmanifest">','').replace('<link rel="apple-touch-icon" href="assets/icon-180.png">','')
(root/'APEX-Track-Lab.html').write_text(html)
(root.parent/'index.html').write_text(html)
