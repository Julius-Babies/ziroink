FROM oven/bun:1

COPY build /app

WORKDIR /app
EXPOSE 3000
CMD ["bun", "index.js"]