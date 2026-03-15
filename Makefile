.PHONY: dev start build clean

dev:
	npm run build && node --watch dist/server.js

start:
	npm run build && node dist/server.js

build:
	npm run build

clean:
	rm -rf dist data

docker-build:
	docker build -t lamina-fs .

docker-run:
	docker run -p 3001:3001 -v $(PWD)/data:/app/data lamina-fs