const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'youcefach05@gmail.com'; // correcting the typo from 055 to 05 based on the db record
  const newPassword = 'password123';
  const salt = await bcrypt.genSalt();
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  
  const user = await prisma.user.update({
    where: { email },
    data: { password: hashedPassword }
  });
  console.log(`Password reset successfully for ${user.email} to: ${newPassword}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
