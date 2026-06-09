/**
 * 초기 데이터 시드 (부록 E)
 * 점포 추가는 이 파일에 row를 더하고 `npm run db:seed` 실행.
 */
import "dotenv/config";
import { db, schema } from "@/db";

async function main() {
  const initial = [
    { plnt: "8227", outletName: "강서", isActive: true },
    // 추후: { plnt: 'XXXX', outletName: '...', isActive: true },
  ];

  for (const row of initial) {
    await db
      .insert(schema.plants)
      .values(row)
      .onConflictDoUpdate({
        target: schema.plants.plnt,
        set: { outletName: row.outletName, isActive: row.isActive },
      });
  }
  console.log(`Seeded ${initial.length} plants.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
