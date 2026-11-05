from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
target=root.parent/'picnic-ball-source.zip'
folders=['client','server','shared','tests','scripts','public','docs']
files=['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','render.yaml','Dockerfile','.dockerignore','.gitignore','README.md','THIRD_PARTY_NOTICES.md']
evidence=['3d-batting.png','3d-clubhouse.png','3d-contact.png','3d-field.png','3d-running.png','3d-slice-report.json','full-match-report.json','browser-report.json','performance.json','visual-contact-sheet.png','full-match.webm','visual-slice.webm','visual-slice-slow.webm','reference-ready.png','reference-card.png','final-smoke.json','final-1280-clubhouse.png','final-1280-batting.png','final-1920-clubhouse.png','final-1920-batting.png']
with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=6) as archive:
    for folder in folders:
        for file in sorted((root/folder).rglob('*')):
            if file.is_file() and '__pycache__' not in file.parts:
                archive.write(file,'picnic-ball/'+str(file.relative_to(root)))
    for name in files:
        archive.write(root/name,'picnic-ball/'+name)
    for name in evidence:
        file=root/'evidence'/name
        if file.exists():archive.write(file,'picnic-ball/evidence/'+name)
    for file in sorted((root/'evidence').glob('reference-play-*.png')):
        archive.write(file,'picnic-ball/evidence/'+file.name)
print(f'{target}: {target.stat().st_size:,} bytes')
