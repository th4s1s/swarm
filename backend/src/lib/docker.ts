import Docker from 'dockerode';
import { run } from './exec.js';

const docker = new Docker();

export interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  created: number;
  size: number;
  inUse: boolean;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
  created: number;
  stats: LiveStat | null;
}

export interface LiveStat {
  cpuPerc: number;
  memUsage: number;
  memLimit: number;
  memPerc: number;
  netIn: number;
  netOut: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

/** Parse Docker's human byte strings ("1.2MiB", "3.4GB") into bytes. */
function parseBytes(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([A-Za-z]*)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  const unit = (m[2] || 'B').toUpperCase();
  const mult: Record<string, number> = {
    B: 1,
    KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12,
    KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
  };
  return n * (mult[unit] ?? 1);
}
function parsePair(s: string): [number, number] {
  const [a, b] = s.split('/').map((x) => parseBytes(x));
  return [a ?? 0, b ?? 0];
}

/** Live per-container stats via `docker stats --no-stream` (reliable, pre-computed CPU%). */
export async function liveStats(): Promise<Map<string, LiveStat>> {
  const map = new Map<string, LiveStat>();
  let out: string;
  try {
    const res = await run('docker', ['stats', '--no-stream', '--no-trunc', '--format', '{{json .}}'], {
      timeoutMs: 30_000,
    });
    out = res.stdout;
  } catch {
    return map;
  }
  for (const line of out.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const s = JSON.parse(t) as Record<string, string>;
      const id = (s['ID'] ?? '').slice(0, 12);
      const [memUsage, memLimit] = parsePair(s['MemUsage'] ?? '0B / 0B');
      const [netIn, netOut] = parsePair(s['NetIO'] ?? '0B / 0B');
      const [blockRead, blockWrite] = parsePair(s['BlockIO'] ?? '0B / 0B');
      map.set(id, {
        cpuPerc: parseFloat((s['CPUPerc'] ?? '0').replace('%', '')) || 0,
        memUsage,
        memLimit,
        memPerc: parseFloat((s['MemPerc'] ?? '0').replace('%', '')) || 0,
        netIn,
        netOut,
        blockRead,
        blockWrite,
        pids: parseInt(s['PIDs'] ?? '0', 10) || 0,
      });
    } catch {
      /* skip */
    }
  }
  return map;
}

export async function listImages(): Promise<ImageInfo[]> {
  const [images, containers] = await Promise.all([
    docker.listImages(),
    docker.listContainers({ all: true }),
  ]);
  const usedImageIds = new Set(containers.map((c) => c.ImageID));
  const out: ImageInfo[] = [];
  for (const img of images) {
    const tags = img.RepoTags && img.RepoTags.length ? img.RepoTags : ['<none>:<none>'];
    for (const rt of tags) {
      const idx = rt.lastIndexOf(':');
      const repository = idx > 0 ? rt.slice(0, idx) : rt;
      const tag = idx > 0 ? rt.slice(idx + 1) : '<none>';
      out.push({
        id: img.Id.replace('sha256:', '').slice(0, 12),
        repository,
        tag,
        created: img.Created,
        size: img.Size,
        inUse: usedImageIds.has(img.Id),
      });
    }
  }
  return out;
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const [containers, stats] = await Promise.all([docker.listContainers({ all: true }), liveStats()]);
  return containers.map((c) => {
    const id = c.Id.slice(0, 12);
    const ports = (c.Ports ?? [])
      .map((p) => (p.PublicPort ? `${p.IP ?? '0.0.0.0'}:${p.PublicPort}->${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`))
      .filter((v, i, a) => a.indexOf(v) === i);
    return {
      id,
      name: (c.Names?.[0] ?? '').replace(/^\//, ''),
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports,
      created: c.Created,
      stats: stats.get(id) ?? null,
    };
  });
}

export const startContainer = (id: string) => docker.getContainer(id).start();
export const stopContainer = (id: string) => docker.getContainer(id).stop();
export const restartContainer = (id: string) => docker.getContainer(id).restart();
export const removeContainer = (id: string, force = false) => docker.getContainer(id).remove({ force });
export const removeImage = (id: string, force = false) => docker.getImage(id).remove({ force });

export interface SystemSample {
  cpu: number;
  mem: number;
  netIn: number;
  netOut: number;
  diskRead: number;
  diskWrite: number;
}

/** Aggregate live stats across all running containers into one system-wide sample. */
export async function systemSample(): Promise<SystemSample> {
  const stats = await liveStats();
  const agg: SystemSample = { cpu: 0, mem: 0, netIn: 0, netOut: 0, diskRead: 0, diskWrite: 0 };
  for (const s of stats.values()) {
    agg.cpu += s.cpuPerc;
    agg.mem += s.memUsage;
    agg.netIn += s.netIn;
    agg.netOut += s.netOut;
    agg.diskRead += s.blockRead;
    agg.diskWrite += s.blockWrite;
  }
  return agg;
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}
