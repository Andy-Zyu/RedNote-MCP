import { SessionHeartbeat } from './src/monitor/sessionHeartbeat';

async function main() {
    console.log('开始手动触发一次全账号的心跳存活检测 (SessionHeartbeat)...');
    const heartbeat = new SessionHeartbeat();

    // 通过强转 any 调用受保护的诊断方法
    try {
        await (heartbeat as any).doCheck();
        console.log('✅ 手动触发的心跳检测已全部完成！');
    } catch (e) {
        console.error('执行失败:', e);
    }

    // 强制退出进程
    process.exit(0);
}

main();
