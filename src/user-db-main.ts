import { FitnessError } from './contracts.ts';
import { createRuntime } from './runtime.ts';
import { PostgresPlugin } from './plugins/postgres.ts';
import { UserDataProtectionPlugin } from './plugins/user-data-protection.ts';
import { UserDatabasePlugin } from './plugins/user-database.ts';
import { grantUserDatabaseAccess, initializeUserLookupKey, migrateUserDatabase, provisionUserTenant } from './user-migrations.ts';

const ctx=createRuntime();
try {
  const args=process.argv.slice(2);
  const command=args[0];
  if (args.length===1 && (command==='--help' || command==='-h')) {
    process.stdout.write([
      '用户数据库管理：node src/user-db-main.ts <命令>',
      'migrate：显式应用校验和迁移；使用迁移账号',
      'grant <运行角色>：授予用户表所需的最小权限；使用迁移账号',
      'key-init：显式初始化身份检索密钥；使用迁移账号并配置密钥',
      'tenant-create <租户UUID> <名称>：创建租户；使用迁移账号',
      'check：验证连接、迁移、运行权限与密钥；使用运行账号',
      '迁移连接使用 FITNESS_DATABASE_MIGRATION_URL；运行连接使用 FITNESS_DATABASE_URL。',
      '',
    ].join('\n'));
  } else {
    const administrative=command==='migrate' || command==='grant' || command==='key-init' || command==='tenant-create';
    const valid=(args.length===1 && ['migrate','key-init','check'].includes(command??'')) || (command==='grant' && args.length===2) || (command==='tenant-create' && args.length===3);
    if (!valid) throw new FitnessError('INVALID_ARGUMENTS','无效数据库命令；使用 --help 查看用法');
    const connectionString=administrative?process.env.FITNESS_DATABASE_MIGRATION_URL:process.env.FITNESS_DATABASE_URL;
    if (!connectionString) throw new FitnessError('DATABASE_CONFIG',administrative?'请配置独立的 FITNESS_DATABASE_MIGRATION_URL':'请配置 FITNESS_DATABASE_URL');
    await ctx.plugin(PostgresPlugin,{ connectionString }).await();
    if (command==='migrate') {
      process.stdout.write(`${JSON.stringify(await migrateUserDatabase(ctx.fitnessDatabase))}\n`);
    } else if (command==='grant') {
      await grantUserDatabaseAccess(ctx.fitnessDatabase,args[1]!); process.stdout.write('{"status":"granted"}\n');
    } else if (command==='tenant-create') {
      await provisionUserTenant(ctx.fitnessDatabase,args[1]!,args[2]!); process.stdout.write('{"status":"created"}\n');
    } else {
      await ctx.plugin(UserDataProtectionPlugin).await();
      if (command==='key-init') { await initializeUserLookupKey(ctx.fitnessDatabase,ctx.fitnessUserDataProtection); process.stdout.write('{"status":"initialized"}\n'); }
      else { await ctx.plugin(UserDatabasePlugin).await(); process.stdout.write(`${JSON.stringify(await ctx.fitnessDatabase.health())}\n`); }
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof FitnessError?error.code:'RUNTIME_ERROR'}: ${error instanceof FitnessError?error.message:'用户数据库管理操作失败'}\n`);
  process.exitCode=1;
} finally { await ctx.fiber.dispose(); }
