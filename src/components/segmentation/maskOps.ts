import * as THREE from '@/lib/threeMath';
import { Volume, voxelToWorld, worldToVoxel } from '../Volume';

export const allocateMaskForPet = (pet: Volume): Uint16Array => {
    return new Uint16Array(pet.nx * pet.ny * pet.nz);
}

export const fillByThreshold = (
    pet: Volume,
    out: Uint16Array,
    threshold: number,
    labelId: number,
) => {
    const v = pet.voxel;
    for (let i = 0; i < v.length; i++) {
        out[i] = v[i] >= threshold ? labelId : 0;
    }
}

export const countByLabel = (mask: Uint16Array): Map<number, number> => {
    const m = new Map<number, number>();
    for (let i = 0; i < mask.length; i++) {
        const v = mask[i];
        if (v === 0) continue;
        m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
}

export interface SphereVolumeStats {
    min: number;
    max: number;
    mean: number;
    std: number;
    voxelCount: number;
}

/** Calculate statistics for a physical spherical VOI in any Volume. */
export const sphereStatsInVolume = (
    volume: Volume,
    centerWorld: THREE.Vector3,
    radiusMm: number,
): SphereVolumeStats => {
    const r = Math.max(0, radiusMm);
    if (r <= 0) return { min: 0, max: 0, mean: 0, std: 0, voxelCount: 0 };

    const { nx, ny, nz, voxel } = volume;
    const centerVoxel = worldToVoxel(centerWorld, volume);

    // world = imagePosition + i*vectorX + j*vectorY + k*vectorZ.
    // The old implementation called voxelToWorld() for every voxel. For a 20 mm
    // sphere that creates a large number of Vector3 objects and matrix operations.
    // Convert the center once, then evaluate the physical distance with the
    // affine basis directly. This is exact for oblique volumes as well.
    const vx = volume.vectorX, vy = volume.vectorY, vz = volume.vectorZ;
    const gxx = vx.dot(vx), gyy = vy.dot(vy), gzz = vz.dot(vz);
    const gxy = vx.dot(vy), gxz = vx.dot(vz), gyz = vy.dot(vz);

    // A physical sphere transformed by M^-1 becomes an ellipsoid in voxel
    // coordinates. For each voxel axis, the maximum coordinate deviation is
    // radius * ||row(M^-1)||. This gives a safe bounding box even for oblique data.
    const a = vx.x, b = vy.x, c = vz.x;
    const d = vx.y, e = vy.y, f = vz.y;
    const g = vx.z, h = vy.z, i = vz.z;
    const A = e * i - f * h;
    const B = f * g - d * i;
    const C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) {
        return { min: 0, max: 0, mean: 0, std: 0, voxelCount: 0 };
    }
    const invDet = 1 / det;
    const m00 = A * invDet, m01 = (c * h - b * i) * invDet, m02 = (b * f - c * e) * invDet;
    const m10 = B * invDet, m11 = (a * i - c * g) * invDet, m12 = (c * d - a * f) * invDet;
    const m20 = C * invDet, m21 = (b * g - a * h) * invDet, m22 = (a * e - b * d) * invDet;

    const padX = Math.ceil(r * Math.hypot(m00, m01, m02)) + 1;
    const padY = Math.ceil(r * Math.hypot(m10, m11, m12)) + 1;
    const padZ = Math.ceil(r * Math.hypot(m20, m21, m22)) + 1;

    const i0 = Math.max(0, Math.floor(centerVoxel.x - padX));
    const i1 = Math.min(nx - 1, Math.ceil(centerVoxel.x + padX));
    const j0 = Math.max(0, Math.floor(centerVoxel.y - padY));
    const j1 = Math.min(ny - 1, Math.ceil(centerVoxel.y + padY));
    const k0 = Math.max(0, Math.floor(centerVoxel.z - padZ));
    const k1 = Math.min(nz - 1, Math.ceil(centerVoxel.z + padZ));

    const r2 = r * r;
    let min = Infinity, max = -Infinity, sum = 0, sum2 = 0, count = 0;

    for (let k = k0; k <= k1; k++) {
        const dz = k - centerVoxel.z;
        for (let j = j0; j <= j1; j++) {
            const dy = j - centerVoxel.y;
            const yz = 2 * dy * dz * gyz;
            for (let ii = i0; ii <= i1; ii++) {
                const dx = ii - centerVoxel.x;
                const d2 =
                    dx * dx * gxx +
                    dy * dy * gyy +
                    dz * dz * gzz +
                    2 * dx * dy * gxy +
                    2 * dx * dz * gxz +
                    yz;
                if (d2 > r2) continue;

                const val = voxel[k * nx * ny + j * nx + ii];
                if (val < min) min = val;
                if (val > max) max = val;
                sum += val;
                sum2 += val * val;
                count++;
            }
        }
    }

    if (count === 0) return { min: 0, max: 0, mean: 0, std: 0, voxelCount: 0 };
    const mean = sum / count;
    return {
        min,
        max,
        mean,
        std: Math.sqrt(Math.max(0, sum2 / count - mean * mean)),
        voxelCount: count,
    };
};
export const sphereStatsInPet = (
    pet: Volume,
    centerWorld: THREE.Vector3,
    radiusMm: number,
) => {
    const s=sphereStatsInVolume(pet,centerWorld,radiusMm);
    return {suvMax:s.max,suvMean:s.mean,suvStd:s.std,voxelCount:s.voxelCount};
}

export interface PolygonPlaneFillParams {
    pet: Volume;
    target: Uint16Array;
    sliceAxis: 0 | 1 | 2;
    sliceIndex: number;
    polygonVoxelXY: Array<[number, number]>;
    writeValue: number;
    // 指定した場合、gate[idx] !== 0 の voxel (= 既にラベルのある前景) のみ書き換える。
    // Polygon は「既存ラベルの修正」用途なので、背景 (ラベル無し) は polygon 内でも触らない。
    gate?: Uint16Array;
}

export const fillPolygonOnSlice = (params: PolygonPlaneFillParams) => {
    const { pet, target, sliceAxis, sliceIndex, polygonVoxelXY, writeValue, gate } = params;
    const { nx, ny, nz } = pet;

    let dimU: number, dimV: number;
    if (sliceAxis === 2) { dimU = nx; dimV = ny; }
    else if (sliceAxis === 1) { dimU = nx; dimV = nz; }
    else { dimU = ny; dimV = nz; }

    if (sliceIndex < 0) return;
    if (sliceAxis === 2 && sliceIndex >= nz) return;
    if (sliceAxis === 1 && sliceIndex >= ny) return;
    if (sliceAxis === 0 && sliceIndex >= nx) return;

    if (polygonVoxelXY.length < 3) return;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [u, v] of polygonVoxelXY) {
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }
    const u0 = Math.max(0, Math.floor(minU));
    const u1 = Math.min(dimU - 1, Math.ceil(maxU));
    const v0 = Math.max(0, Math.floor(minV));
    const v1 = Math.min(dimV - 1, Math.ceil(maxV));

    for (let v = v0; v <= v1; v++) {
        for (let u = u0; u <= u1; u++) {
            if (!pointInPolygon(u + 0.5, v + 0.5, polygonVoxelXY)) continue;
            const idx = voxelIndexFromAxis(sliceAxis, sliceIndex, u, v, nx, ny);
            if (gate && gate[idx] === 0) continue;   // 背景 (ラベル無し) は変更しない
            target[idx] = writeValue;
        }
    }
}

const voxelIndexFromAxis = (
    sliceAxis: 0 | 1 | 2,
    sliceIndex: number,
    u: number, v: number,
    nx: number, ny: number,
): number => {
    if (sliceAxis === 2) return sliceIndex * nx * ny + v * nx + u;
    if (sliceAxis === 1) return v * nx * ny + sliceIndex * nx + u;
    return v * nx * ny + u * nx + sliceIndex;
}

const pointInPolygon = (px: number, py: number, poly: Array<[number, number]>): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export const findMaximumAxis = (v: THREE.Vector3): 0 | 1 | 2 => {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    if (ax >= ay && ax >= az) return 0;
    if (ay >= ax && ay >= az) return 1;
    return 2;
}

// 26-connected components labeling. Returns Uint16 component map (1..K),
// 0 = background. Treats all non-zero voxels as foreground.
export const connectedComponents26 = (
    mask: Uint16Array,
    nx: number, ny: number, nz: number,
): { components: Uint16Array; count: number } => {
    const out = new Uint16Array(mask.length);
    let nextId = 1;
    const stackI = new Int32Array(mask.length);
    const stackJ = new Int32Array(mask.length);
    const stackK = new Int32Array(mask.length);

    const idx = (i: number, j: number, k: number) => k * nx * ny + j * nx + i;

    for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const a = idx(i, j, k);
                if (mask[a] === 0 || out[a] !== 0) continue;
                const id = nextId++;
                if (id > 65535) {
                    // Out of Uint16 range; bail with what we have.
                    return { components: out, count: id - 1 };
                }
                let sp = 0;
                stackI[sp] = i; stackJ[sp] = j; stackK[sp] = k; sp++;
                out[a] = id;
                while (sp > 0) {
                    sp--;
                    const ci = stackI[sp], cj = stackJ[sp], ck = stackK[sp];
                    for (let dk = -1; dk <= 1; dk++) {
                        const nk = ck + dk; if (nk < 0 || nk >= nz) continue;
                        for (let dj = -1; dj <= 1; dj++) {
                            const nj = cj + dj; if (nj < 0 || nj >= ny) continue;
                            for (let di = -1; di <= 1; di++) {
                                if (di === 0 && dj === 0 && dk === 0) continue;
                                const ni = ci + di; if (ni < 0 || ni >= nx) continue;
                                const b = idx(ni, nj, nk);
                                if (mask[b] === 0 || out[b] !== 0) continue;
                                out[b] = id;
                                stackI[sp] = ni; stackJ[sp] = nj; stackK[sp] = nk; sp++;
                            }
                        }
                    }
                }
            }
        }
    }
    return { components: out, count: nextId - 1 };
}

// CT 寝台 (table / bed / 患者固定具など) を除去するための「体マスク」抽出。
// アルゴリズム:
//   1. CT volume を threshold (デフォルト -300 HU) で binary 化 (体 + 寝台 + 衣服)
//   2. 26-連結成分抽出
//   3. 最大成分 = 体。それ以外を 0、体内 voxel を 1 とする Uint8Array を返す
//
// 引数 voxel は Float32Array (HU 値)。返り値は同じ長さの Uint8Array。
// 1 = 体内 (表示する)、0 = 体外 (寝台や空気、表示時に -1024 等で塗り潰す)
export const extractCtBodyMask = (
    voxel: Float32Array,
    nx: number, ny: number, nz: number,
    threshold: number = -300,
): Uint8Array => {
    const N = nx * ny * nz;

    // 1. binary mask
    const binary = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
        if (voxel[i] > threshold) binary[i] = 1;
    }

    // 2. 26-CC
    const { components, count } = connectedComponents26(binary, nx, ny, nz);

    // 3. 最大成分を見つける
    if (count === 0) return new Uint8Array(N); // 全部 0 = 体なし
    const sizes = new Int32Array(count + 1);
    for (let i = 0; i < N; i++) {
        const c = components[i];
        if (c > 0) sizes[c]++;
    }
    let maxId = 1, maxSize = 0;
    for (let c = 1; c <= count; c++) {
        if (sizes[c] > maxSize) { maxSize = sizes[c]; maxId = c; }
    }

    const body = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
        if (components[i] === maxId) body[i] = 1;
    }
    return body;
};

// finalMask を 26-連結成分に分解し、各病変の SUVmax / SUVmean / MTV / TLG / 重心 (mm) を返す。
// 1 component = 1 lesion とみなし、内部の voxel 群から:
//   - SUVmax  : 最大 PET 値
//   - SUVmean : 平均 PET 値
//   - MTV_cc  : voxel 数 × voxel 体積 (mm^3) ÷ 1000
//   - TLG     : SUVmean × MTV_cc
//   - centroid (world mm) : i,j,k 平均を voxelToWorld 変換した位置
//   - dominantLabelId : component 内で最も voxel 数が多い label id
// SUVpeak (1cc 球内最大) は計算コスト高いため第二段で別ヘルパに切り出す方針 (現時点で未実装)。
export interface LesionStat {
    componentId: number;
    labelId: number;
    labelName: string;
    voxelCount: number;
    mtvCc: number;
    suvMax: number;
    suvMean: number;
    suvPeak: number;       // 1 cc 球を SUVmax voxel に中心配置したときの平均 SUV (簡易 PERCIST-like)
    tlg: number;
    centroidWorld: [number, number, number];
    suvMaxWorld: [number, number, number];   // SUVmax voxel の世界座標 (jump 用にも)
}

export const summarizeLesions = (
    pet: Volume,
    mask: Uint16Array,
    labels: Array<{ id: number; name: string; color?: [number, number, number] }>,
): LesionStat[] => {
    const nx = pet.nx, ny = pet.ny, nz = pet.nz;
    const N = nx * ny * nz;
    if (mask.length !== N) return [];
    const voxel = pet.voxel;

    // foreground = non-zero
    const binary = new Uint16Array(N);
    let anyFg = false;
    for (let i = 0; i < N; i++) {
        if (mask[i] !== 0) { binary[i] = 1; anyFg = true; }
    }
    if (!anyFg) return [];

    const { components, count } = connectedComponents26(binary, nx, ny, nz);
    if (count === 0) return [];

    const sumSuv = new Float64Array(count + 1);
    const maxSuv = new Float64Array(count + 1);
    for (let c = 0; c <= count; c++) maxSuv[c] = -Infinity;
    // SUVmax voxel の voxel 座標 (SUVpeak 計算用に保持)
    const maxI = new Int32Array(count + 1);
    const maxJ = new Int32Array(count + 1);
    const maxK = new Int32Array(count + 1);
    const sumI = new Float64Array(count + 1);
    const sumJ = new Float64Array(count + 1);
    const sumK = new Float64Array(count + 1);
    const cnt = new Int32Array(count + 1);
    const labelHist: Array<Map<number, number>> = new Array(count + 1);
    for (let c = 0; c <= count; c++) labelHist[c] = new Map();

    let p = 0;
    for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const c = components[p];
                if (c !== 0) {
                    const v = voxel[p];
                    sumSuv[c] += v;
                    if (v > maxSuv[c]) {
                        maxSuv[c] = v;
                        maxI[c] = i; maxJ[c] = j; maxK[c] = k;
                    }
                    sumI[c] += i;
                    sumJ[c] += j;
                    sumK[c] += k;
                    cnt[c]++;
                    const lid = mask[p];
                    labelHist[c].set(lid, (labelHist[c].get(lid) ?? 0) + 1);
                }
                p++;
            }
        }
    }

    // SUVpeak: 1 cc 球 (radius = (3/4π)^(1/3) cm = 0.6204 cm = 6.204 mm) を SUVmax voxel に中心配置
    // した平均 SUV (簡易 PERCIST。VOI 外に球がはみ出す場合もそのまま 1cc 球として扱う)。
    const SUVPEAK_RADIUS_MM = 6.204;

    const labelNameById = new Map<number, string>();
    for (const l of labels) labelNameById.set(l.id, l.name);

    const voxVolMm3 = pet.vectorX.length() * pet.vectorY.length() * pet.vectorZ.length();
    const out: LesionStat[] = [];
    const work = new THREE.Vector3();
    for (let c = 1; c <= count; c++) {
        const n = cnt[c];
        if (n === 0) continue;
        let domLid = 0, domCnt = 0;
        for (const [lid, cc] of labelHist[c]) {
            if (cc > domCnt) { domCnt = cc; domLid = lid; }
        }
        work.set(sumI[c] / n, sumJ[c] / n, sumK[c] / n);
        const cw = voxelToWorld(work, pet);
        // SUVmax voxel の世界座標 (SUVpeak 球の中心 + jump 用)
        work.set(maxI[c] + 0.5, maxJ[c] + 0.5, maxK[c] + 0.5);
        const mw = voxelToWorld(work, pet);
        const peakStats = sphereStatsInPet(pet, mw, SUVPEAK_RADIUS_MM);
        const mean = sumSuv[c] / n;
        const mtvCc = (n * voxVolMm3) / 1000;
        out.push({
            componentId: c,
            labelId: domLid,
            labelName: labelNameById.get(domLid) ?? `(label ${domLid})`,
            voxelCount: n,
            mtvCc,
            suvMax: maxSuv[c],
            suvMean: mean,
            suvPeak: peakStats.suvMean,
            tlg: mean * mtvCc,
            centroidWorld: [cw.x, cw.y, cw.z],
            suvMaxWorld: [mw.x, mw.y, mw.z],
        });
    }
    out.sort((a, b) => b.suvMax - a.suvMax);
    return out;
};

// クリック位置 (seed) から mask 上を 26-連結で局所 flood fill し、**seed と同じラベルの
// 連結領域だけ** を labelId に書き換える。画像全体の連結成分ラベリングを毎回走らせる
// 必要がないため O(領域サイズ) で完了する (全 voxel 数に依存しない)。
//
// ★ 連結性の定義は「seed と同一ラベル」であって「非ゼロ」ではない。
//   非ゼロ判定だと、例えば球全体 Tumor → 中間スライスを polygon で Physio に変えた後、
//   上半球に assign すると Physio スライス (非ゼロ) を **通過して** 下半球まで波及する
//   バグになる (球体ファントム実験で再現・確認済み)。同一ラベル判定なら、異なるラベルの
//   領域が境界として働き、ユーザが視覚的に区別している「segment」単位で塗り替えられる。
//
// - 背景 (0) も他ラベルも境界。seed が背景なら何もしない。
// - seed のラベルが既に labelId でも塗り直す (manualEdits へ確定させる意味がある)。
// - manualEdits が渡された場合は同じ voxel を labelId に書き込み、recomputeFinalMask で
//   ラベルが元に戻らないようにする。
export interface AssignFloodResult {
    count: number;
    /** 書き換えた voxel の flat index (undo 用 sparse diff の材料)。 */
    changedIdx: Uint32Array;
    /** 各 changedIdx における manualEdits の before 値 (undo 用)。 */
    manualBefore: Uint16Array;
}

export const floodFillAssignLabel = (
    mask: Uint16Array,
    manualEdits: Uint16Array | null,
    seed: { i: number; j: number; k: number },
    nx: number, ny: number, nz: number,
    labelId: number,
): AssignFloodResult => {
    const empty: AssignFloodResult = { count: 0, changedIdx: new Uint32Array(0), manualBefore: new Uint16Array(0) };
    const seedIdx = seed.k * nx * ny + seed.j * nx + seed.i;
    const seedLabel = mask[seedIdx];
    if (seedLabel === 0) return empty;   // クリック位置がマスク外なら何もしない

    const visited = new Set<number>();
    const stack: number[] = [seedIdx];
    visited.add(seedIdx);
    const nxny = nx * ny;
    let count = 0;
    // 変更点を記録して呼び出し側で O(領域) の sparse diff を作れるようにする
    // (履歴のために全 mask を clone/走査すると WB PET で ~100MB コピー + O(n) 走査になり
    //  クリックのたびに一瞬固まる。それを避ける)。
    const changed: number[] = [];
    const mBefore: number[] = [];

    while (stack.length > 0) {
        const cur = stack.pop()!;
        const k = (cur / nxny) | 0;
        const rem = cur - k * nxny;
        const j = (rem / nx) | 0;
        const i = rem - j * nx;

        changed.push(cur);
        mBefore.push(manualEdits ? manualEdits[cur] : 0);
        mask[cur] = labelId;
        if (manualEdits) manualEdits[cur] = labelId;
        count++;

        for (let dk = -1; dk <= 1; dk++) {
            const nk = k + dk; if (nk < 0 || nk >= nz) continue;
            for (let dj = -1; dj <= 1; dj++) {
                const nj = j + dj; if (nj < 0 || nj >= ny) continue;
                for (let di = -1; di <= 1; di++) {
                    if (di === 0 && dj === 0 && dk === 0) continue;
                    const ni = i + di; if (ni < 0 || ni >= nx) continue;
                    const b = nk * nxny + nj * nx + ni;
                    if (mask[b] !== seedLabel) continue;   // 背景も他ラベルも境界
                    if (visited.has(b)) continue;
                    visited.add(b);
                    stack.push(b);
                }
            }
        }
    }
    return { count, changedIdx: Uint32Array.from(changed), manualBefore: Uint16Array.from(mBefore) };
};

// seed voxel が属する 26-連結成分 (非ゼロ = summarizeLesions の binary と同定義) の
// 各 voxel の PET 値 (SUV) を集める。病変単位ヒストグラム用。read-only。
export const collectComponentSuv = (
    mask: Uint16Array,
    petVoxel: Float32Array | Int16Array,
    seed: { i: number; j: number; k: number },
    nx: number, ny: number, nz: number,
): number[] => {
    const nxny = nx * ny;
    const seedIdx = seed.k * nxny + seed.j * nx + seed.i;
    if (seedIdx < 0 || seedIdx >= mask.length || mask[seedIdx] === 0) return [];
    const visited = new Set<number>();
    const stack: number[] = [seedIdx];
    visited.add(seedIdx);
    const out: number[] = [];
    while (stack.length > 0) {
        const cur = stack.pop()!;
        const k = (cur / nxny) | 0;
        const rem = cur - k * nxny;
        const j = (rem / nx) | 0;
        const i = rem - j * nx;
        out.push(petVoxel[cur]);
        for (let dk = -1; dk <= 1; dk++) {
            const nk = k + dk; if (nk < 0 || nk >= nz) continue;
            for (let dj = -1; dj <= 1; dj++) {
                const nj = j + dj; if (nj < 0 || nj >= ny) continue;
                for (let di = -1; di <= 1; di++) {
                    if (di === 0 && dj === 0 && dk === 0) continue;
                    const ni = i + di; if (ni < 0 || ni >= nx) continue;
                    const b = nk * nxny + nj * nx + ni;
                    if (mask[b] === 0 || visited.has(b)) continue;
                    visited.add(b);
                    stack.push(b);
                }
            }
        }
    }
    return out;
};

// 与えられた voxel (i,j,k) が属する成分の全 voxel に対して mask 上で labelId に書き換える。
export const assignLabelToComponent = (
    components: Uint16Array,
    targetMask: Uint16Array,
    seed: { i: number; j: number; k: number },
    nx: number, ny: number,
    labelId: number,
) => {
    const seedIdx = seed.k * nx * ny + seed.j * nx + seed.i;
    const compId = components[seedIdx];
    if (compId === 0) return 0;
    let count = 0;
    for (let i = 0; i < components.length; i++) {
        if (components[i] === compId) {
            targetMask[i] = labelId;
            count++;
        }
    }
    return count;
}
