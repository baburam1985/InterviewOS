import {sqliteTable,text,primaryKey} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{userId:text('user_id').notNull(),id:text('id').notNull(),kind:text('kind').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull()},t=>[primaryKey({columns:[t.userId,t.id]})]);
