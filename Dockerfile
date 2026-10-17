FROM node:24-alpine

ENV HOST=0.0.0.0 \
    PORT=3000 \
    NOTES_DIR=/data/notes \
    LOG_DIR=/data/logs

WORKDIR /app

COPY --chown=node:node index.html Bloc-notes_Markdown_icon.ico ./
COPY --chown=node:node css ./css
COPY --chown=node:node js ./js
COPY --chown=node:node server ./server

USER node

EXPOSE 3000

CMD ["node", "server/server.js"]
