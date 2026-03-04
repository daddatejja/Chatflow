import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const messages = await prisma.message.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, content: true, senderId: true, receiverId: true }
    });
    console.log(JSON.stringify(messages, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
