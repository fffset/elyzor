import cluster from 'cluster';
import os from 'os';

const CPU_COUNT = os.cpus().length;
const TOTAL_RAM_MB = Math.floor(os.totalmem() / 1024 / 1024);
const RAM_PER_WORKER_MB = Math.floor(TOTAL_RAM_MB / CPU_COUNT);

// Worker başına RAM eşiği: payına düşenin %80'i
const RAM_WARN_THRESHOLD_MB = Math.floor(RAM_PER_WORKER_MB * 0.8);

function logPrimary(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[cluster:primary] ${msg}`);
}

function logWorker(workerId: number, msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[cluster:worker:${workerId}] ${msg}`);
}

function startWorker(): void {
  const worker = cluster.fork();
  logPrimary(
    `Worker #${worker.id} (pid=${worker.process.pid}) başlatıldı — RAM payı: ${RAM_PER_WORKER_MB} MB`
  );
}

function shutdownPrimary(signal: string): void {
  logPrimary(`${signal} alındı — tüm worker'lar kapatılıyor`);

  const workers = Object.values(cluster.workers ?? {});
  workers.forEach((worker) => {
    if (worker && !worker.isDead()) {
      worker.kill(signal);
    }
  });

  // Worker'ların kapanmasını bekle (maks 15 saniye)
  setTimeout(() => {
    logPrimary("Worker'lar zaman aşımında kapanmadı — zorla çıkılıyor");
    process.exit(1);
  }, 15_000).unref();
}

function monitorWorkerMemory(workerId: number): void {
  const interval = setInterval(() => {
    if (!cluster.workers) {
      clearInterval(interval);
      return;
    }

    const worker = Object.values(cluster.workers).find((w) => w?.id === workerId);
    if (!worker || worker.isDead()) {
      clearInterval(interval);
      return;
    }

    try {
      // Node.js process.memoryUsage() worker'dan mesaj ile alınır
      worker.send({ type: 'memory_check' });
    } catch {
      clearInterval(interval);
    }
  }, 10_000);
}

if (cluster.isPrimary) {
  logPrimary(`Sistem: ${CPU_COUNT} CPU çekirdeği | ${TOTAL_RAM_MB} MB toplam RAM`);
  logPrimary(
    `Worker başına RAM payı: ${RAM_PER_WORKER_MB} MB | Uyarı eşiği: ${RAM_WARN_THRESHOLD_MB} MB`
  );
  logPrimary(`${CPU_COUNT} worker başlatılıyor...`);

  for (let i = 0; i < CPU_COUNT; i++) {
    startWorker();
  }

  cluster.on('fork', (worker) => {
    monitorWorkerMemory(worker.id);
  });

  cluster.on('message', (worker, msg: unknown) => {
    if (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as Record<string, unknown>).type === 'memory_report'
    ) {
      const { heapUsedMB, rssMB } = msg as { heapUsedMB: number; rssMB: number };
      if (rssMB > RAM_WARN_THRESHOLD_MB) {
        logWorker(
          worker.id,
          `RAM uyarısı: rss=${rssMB} MB / sınır=${RAM_WARN_THRESHOLD_MB} MB (heap=${heapUsedMB} MB)`
        );
      }
    }
  });

  cluster.on('exit', (worker, code, signal) => {
    const reason = signal ?? `exit code ${code}`;
    // SIGTERM/SIGINT ile kapatılan worker'lar yeniden başlatılmaz
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      logPrimary(`Worker #${worker.id} sinyal ile kapatıldı (${reason}) — yeniden başlatılmıyor`);
      return;
    }
    logPrimary(`Worker #${worker.id} kapandı (${reason}) — yeniden başlatılıyor...`);
    startWorker();
  });

  process.on('SIGTERM', () => shutdownPrimary('SIGTERM'));
  process.on('SIGINT', () => shutdownPrimary('SIGINT'));
} else {
  // Worker process: uygulamayı yükle
  const workerId = cluster.worker?.id ?? 0;
  logWorker(workerId, `Başlatılıyor (pid=${process.pid})...`);

  // Primary'den gelen memory_check mesajlarını yanıtla
  process.on('message', (msg: unknown) => {
    if (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as Record<string, unknown>).type === 'memory_check'
    ) {
      const mem = process.memoryUsage();
      const heapUsedMB = Math.floor(mem.heapUsed / 1024 / 1024);
      const rssMB = Math.floor(mem.rss / 1024 / 1024);
      process.send?.({ type: 'memory_report', heapUsedMB, rssMB });
    }
  });

  // Worker'ın kendi app'ini başlat
  import('./index').catch((err: Error) => {
    logWorker(workerId, `Başlatma hatası: ${err.message}`);
    process.exit(1);
  });
}
