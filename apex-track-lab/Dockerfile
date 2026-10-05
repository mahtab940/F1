FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY dist ./dist
ENV PORT=4173
EXPOSE 4173
USER node
CMD ["node", "server.mjs"]
