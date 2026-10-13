# Banc de test Mistral OCR

Application locale pour tester l’API **Mistral OCR** avec ta clé workspace : upload PDF/image ou URL publique, visualisation du markdown extrait, et mesure par document (pages facturées, tokens estimés, coût).

## Important : facturation

- L’API OCR Mistral facture **à la page** (tarif public : **4 USD / 1 000 pages**), pas en tokens.
- La réponse API expose `usage_info.pages_processed` (et éventuellement `doc_size_bytes`).
- Les **tokens output** affichés sont une **estimation locale** du markdown (tokenizer Tekken via `mistral-common`) : **non facturés**.
- Les **tokens prompt** restent à **0** pour un appel OCR sans prompt texte.
- Chaque clic sur « Lancer le test OCR » consomme du crédit Mistral.

## Prérequis

- Python 3.10+
- Node.js 18+
- Une clé API Mistral (workspace) avec accès OCR

## Configuration

```bash
cp backend/.env.example backend/.env
```

Édite `backend/.env` et renseigne :

```env
MISTRAL_API_KEY=ta_cle_ici
OCR_USD_PER_PAGE=0.004
OCR_MODEL=mistral-ocr-latest
```

La clé reste côté serveur : elle n’est jamais envoyée au navigateur.

## Installation (une fois)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cd ../frontend
npm install
```

## Démarrage / arrêt

```bash
make start   # backend :8001 + frontend :5173
make stop    # arrête les deux
make status  # état des process
```

- Frontend : [http://127.0.0.1:5173](http://127.0.0.1:5173)
- Santé API : [http://127.0.0.1:8001/api/health](http://127.0.0.1:8001/api/health)
- Logs : `.run/backend.log` et `.run/frontend.log`

> Si le port 8001 est pris, change `BACKEND_PORT` dans le `Makefile` et le proxy dans `frontend/vite.config.ts`.

## Utilisation

1. Dépose un PDF/image **ou** colle une URL publique (ex. un PDF arXiv).
2. Clique sur **Lancer le test OCR**.
3. Consulte les cartes : pages, tokens estimés, coût, durée.
4. Relis un run depuis l’historique (stocké en SQLite dans `backend/data/runs.sqlite`).

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/health` | Statut + clé configurée |
| `POST` | `/api/ocr` | Multipart : champ `file` ou `url` |
| `POST` | `/api/ocr/url` | JSON `{ "url": "..." }` |
| `GET` | `/api/runs` | Historique + totaux |
| `GET` | `/api/runs/{id}` | Détail d’un run (markdown inclus) |
# mistral-ocr-estimation
