COMPOSE := docker compose -f docker-compose.yml

.PHONY: start stop reset logs studio

start:
	$(COMPOSE) up -d mongo

stop:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v

studio:
	$(COMPOSE) --profile studio up -d mongo mongo-express
	@echo "Mongo Express → http://127.0.0.1:18081"

logs:
	$(COMPOSE) logs -f
