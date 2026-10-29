#!/usr/bin/env bash
# SET Service — local setup skripti
# İstifadə: bash scripts/setup.sh

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== SET Service API — Setup ===${NC}\n"

# Node version check
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}Node.js 18+ lazımdır. Mövcud: $(node -v)${NC}"
  exit 1
fi

# npm install
echo -e "${YELLOW}→ npm install...${NC}"
npm install

# .env check
if [ ! -f .env ]; then
  echo -e "${YELLOW}→ .env.example-dən .env yaradılır...${NC}"
  cp .env.example .env
  echo -e "${RED}  ⚠ .env faylını doldurun: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, QR_HMAC_SECRET${NC}"
fi

# Prisma generate
echo -e "${YELLOW}→ Prisma client generate...${NC}"
npx prisma generate

# DB migration (DATABASE_URL dolduşundursa)
if grep -q "postgresql://user:password" .env; then
  echo -e "${YELLOW}  ⚠ DATABASE_URL hələ default-dur — migrate skip edildi${NC}"
  echo -e "    .env-i doldurun, sonra: ${GREEN}npm run db:migrate${NC}"
else
  echo -e "${YELLOW}→ Prisma migrate dev...${NC}"
  npm run db:migrate
fi

echo -e "\n${GREEN}✓ Setup tamamlandı!${NC}"
echo -e "  Server başlatmaq üçün: ${GREEN}npm run dev${NC}"
echo -e "  Swagger UI: ${GREEN}http://localhost:3000/docs${NC}"
