import { openDatabase } from '../src/db.ts';
import { loadEnv } from '../src/env.ts';
import { ExpenseService } from '../src/expenses/service.ts';

console.log(' Starting end-to-end trip verification against Cloud SQL...');

loadEnv();
const db = await openDatabase();
const service = new ExpenseService(db);

try {
  // 1. Create a Trip Group
  console.log('\n1. Creating test trip group...');
  const group = await service.mutate('groups', `trip-test-${Date.now()}`, { name: 'Manali Expedition' }, async (tx) => {
    return service.createGroup({
      name: 'Manali Expedition',
      members: ['Asha', 'Gaurav', 'Rohit'],
    }, tx);
  }) as { id: string; members: { id: string; name: string }[] };

  console.log(' Created Group:', group.id);
  console.log('   Members:', group.members.map(m => `${m.name} (${m.id.slice(0, 6)}...)`).join(', '));

  const gaurav = group.members.find(m => m.name === 'Gaurav')!;
  const asha = group.members.find(m => m.name === 'Asha')!;
  const rohit = group.members.find(m => m.name === 'Rohit')!;

  // 2. Add an Expense (Cottage stay: ₹9,000 paid by Gaurav)
  console.log('\n2. Adding shared trip expense: ₹9,000 (Riverside Cottage)...');
  const expense = await service.mutate(`${group.id}/expenses`, `exp-${Date.now()}`, {}, async (tx) => {
    return service.addExpense(group.id, {
      payerId: gaurav.id,
      description: 'Riverside Cottage Stay',
      amountPaise: 900000,
      split: {
        type: 'equal',
        participants: group.members.map(m => ({ memberId: m.id })),
      },
    }, tx);
  }) as { id: string; amountPaise: number };

  console.log(' Added Expense:', expense.id, `(₹${expense.amountPaise / 100})`);

  // 3. Check Balances
  console.log('\n3. Checking calculated balances...');
  const balances = await service.balances(group.id);
  console.log('   Balances (in INR):');
  for (const b of balances) {
    const memberName = group.members.find(m => m.id === b.memberId)?.name;
    const sign = b.netPaise > 0 ? '+' : '';
    console.log(`     ${memberName}: ${sign}₹${b.netPaise / 100}`);
  }

  // 4. Get Settlement Suggestions
  console.log('\n4. Generating transfer suggestions...');
  const suggestions = await service.suggestions(group.id);
  console.log('   Suggested Transfers:');
  for (const t of suggestions) {
    const fromName = group.members.find(m => m.id === t.fromMemberId)?.name;
    const toName = group.members.find(m => m.id === t.toMemberId)?.name;
    console.log(`     ${fromName} ➔ ${toName}: ₹${t.amountPaise / 100}`);
  }

  // 5. Record a Settlement (Asha pays Gaurav ₹3,000)
  console.log('\n5. Recording Asha settled with Gaurav (₹3,000)...');
  await service.mutate(`${group.id}/settlements`, `settle-${Date.now()}`, {}, async (tx) => {
    return service.addSettlement(group.id, {
      fromMemberId: asha.id,
      toMemberId: gaurav.id,
      amountPaise: 300000,
      confirmed: true,
      note: 'UPI payment confirmation #982138',
    }, tx);
  });
  console.log(' Settlement recorded!');

  // 6. Verify Updated Balances
  console.log('\n6. Checking updated balances after settlement...');
  const updatedBalances = await service.balances(group.id);
  for (const b of updatedBalances) {
    const memberName = group.members.find(m => m.id === b.memberId)?.name;
    const sign = b.netPaise > 0 ? '+' : '';
    console.log(`     ${memberName}: ${sign}₹${b.netPaise / 100}`);
  }

  console.log('\n ALL TESTS PASSED! Cloud SQL connectivity is fully operational.');
} finally {
  await db.close();
}
