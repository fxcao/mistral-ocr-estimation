# Banc de test Mistral OCR — démarrage / arrêt local

ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
BACKEND_DIR := $(ROOT)backend
FRONTEND_DIR := $(ROOT)frontend
RUN_DIR := $(ROOT).run
BACKEND_PID := $(RUN_DIR)/backend.pid
FRONTEND_PID := $(RUN_DIR)/frontend.pid
BACKEND_LOG := $(RUN_DIR)/backend.log
FRONTEND_LOG := $(RUN_DIR)/frontend.log

BACKEND_HOST := 127.0.0.1
BACKEND_PORT := 8001
FRONTEND_PORT := 5173

UVICORN := $(BACKEND_DIR)/.venv/bin/uvicorn
NPM := npm

.PHONY: start stop status help

help:
	@echo "Commandes :"
	@echo "  make start  — démarre backend (port $(BACKEND_PORT)) + frontend (port $(FRONTEND_PORT))"
	@echo "  make stop   — arrête backend et frontend"
	@echo "  make status — affiche l'état des process"

start: ## Démarre backend + frontend en arrière-plan
	@mkdir -p "$(RUN_DIR)"
	@if [ ! -x "$(UVICORN)" ]; then \
		echo "Erreur: venv backend manquant. Lance d'abord :"; \
		echo "  cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"; \
		exit 1; \
	fi
	@if [ ! -d "$(FRONTEND_DIR)/node_modules" ]; then \
		echo "Erreur: node_modules manquant. Lance d'abord :"; \
		echo "  cd frontend && npm install"; \
		exit 1; \
	fi
	@if [ ! -f "$(BACKEND_DIR)/.env" ]; then \
		echo "Avertissement: backend/.env absent. Copie .env.example et renseigne MISTRAL_API_KEY."; \
	fi
	@$(MAKE) --no-print-directory _ensure_stopped
	@echo "Démarrage backend sur http://$(BACKEND_HOST):$(BACKEND_PORT) …"
	@cd "$(BACKEND_DIR)" && \
		nohup "$(UVICORN)" app.main:app --host $(BACKEND_HOST) --port $(BACKEND_PORT) \
		> "$(BACKEND_LOG)" 2>&1 & echo $$! > "$(BACKEND_PID)"
	@echo "Démarrage frontend sur http://127.0.0.1:$(FRONTEND_PORT) …"
	@cd "$(FRONTEND_DIR)" && \
		nohup $(NPM) run dev -- --host 127.0.0.1 --port $(FRONTEND_PORT) \
		> "$(FRONTEND_LOG)" 2>&1 & echo $$! > "$(FRONTEND_PID)"
	@sleep 1
	@echo ""
	@echo "OK — logs : $(RUN_DIR)/"
	@echo "  Backend  : http://$(BACKEND_HOST):$(BACKEND_PORT)/api/health"
	@echo "  Frontend : http://127.0.0.1:$(FRONTEND_PORT)"
	@echo "Arrêt      : make stop"

stop: ## Arrête backend + frontend
	@echo "Arrêt des services…"
	@$(MAKE) --no-print-directory _kill_pid PID_FILE="$(BACKEND_PID)" LABEL=backend
	@$(MAKE) --no-print-directory _kill_pid PID_FILE="$(FRONTEND_PID)" LABEL=frontend
	@$(MAKE) --no-print-directory _free_port PORT=$(BACKEND_PORT) LABEL=backend
	@$(MAKE) --no-print-directory _free_port PORT=$(FRONTEND_PORT) LABEL=frontend
	@rm -f "$(BACKEND_PID)" "$(FRONTEND_PID)"
	@echo "Tout est arrêté."

status:
	@$(MAKE) --no-print-directory _status_one PID_FILE="$(BACKEND_PID)" LABEL=backend PORT=$(BACKEND_PORT)
	@$(MAKE) --no-print-directory _status_one PID_FILE="$(FRONTEND_PID)" LABEL=frontend PORT=$(FRONTEND_PORT)

_ensure_stopped:
	@if [ -f "$(BACKEND_PID)" ] || [ -f "$(FRONTEND_PID)" ]; then \
		echo "Des process sont déjà enregistrés — redémarrage propre…"; \
		$(MAKE) --no-print-directory stop; \
	fi

_kill_pid:
	@if [ -f "$(PID_FILE)" ]; then \
		pid=$$(cat "$(PID_FILE)"); \
		if kill -0 $$pid 2>/dev/null; then \
			echo "  stop $(LABEL) (pid $$pid)"; \
			pkill -P $$pid 2>/dev/null || true; \
			kill $$pid 2>/dev/null || true; \
			sleep 0.3; \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
		rm -f "$(PID_FILE)"; \
	fi

_free_port:
	@pids=$$(lsof -tiTCP:$(PORT) -sTCP:LISTEN 2>/dev/null || true); \
	if [ -n "$$pids" ]; then \
		echo "  libère le port $(PORT) ($(LABEL)) : $$pids"; \
		kill $$pids 2>/dev/null || true; \
		sleep 0.2; \
		kill -9 $$pids 2>/dev/null || true; \
	fi

_status_one:
	@if [ -f "$(PID_FILE)" ] && kill -0 $$(cat "$(PID_FILE)") 2>/dev/null; then \
		echo "$(LABEL): running (pid $$(cat "$(PID_FILE)"), port $(PORT))"; \
	elif lsof -tiTCP:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "$(LABEL): port $(PORT) occupé (pid $$(lsof -tiTCP:$(PORT) -sTCP:LISTEN | tr '\n' ' '))"; \
	else \
		echo "$(LABEL): stopped"; \
	fi
