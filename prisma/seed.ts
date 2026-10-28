import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface RawCity {
  name: string
  province: string
  lat: number
  lon: number
  isCapital: boolean
}

const db = new PrismaClient()

async function main() {
  const raw: RawCity[] = JSON.parse(
    readFileSync(join(__dirname, 'iran-cities.json'), 'utf-8')
  )

  await db.city.deleteMany()

  const data = raw.map((c) => ({
    name: c.name,
    province: c.province,
    lat: c.lat,
    lon: c.lon,
    isCapital: Boolean(c.isCapital),
  }))

  for (let i = 0; i < data.length; i += 100) {
    await db.city.createMany({ data: data.slice(i, i + 100) })
  }

  const count = await db.city.count()
  console.log(`✅ Seeded ${count} Iranian cities`)
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
