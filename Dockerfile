# Not used by Vercel (Vercel builds from vercel.json). For self-hosting / local parity:
#   docker build -t feel-the-earth . && docker run -p 8080:80 feel-the-earth
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# MapLibre worker ships as .mjs; make sure nginx serves it as JavaScript.
RUN grep -q mjs /etc/nginx/mime.types || sed -i "s/ js;/ js mjs;/" /etc/nginx/mime.types
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
