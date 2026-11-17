/**
 * 会话与附件的远端持久化。
 *
 * 设计原则：
 * - 本地 IndexedDB 仍是主存储（界面读写不等待网络）；
 * - 每次写入后异步推送到服务端，服务端逐条落盘，不是周期性快照；
 * - 任何网络失败都静默降级，不影响本地使用；
 * - 本地为空时（换浏览器、清过数据）从服务端恢复。
 */

import type { Session, SessionSummary } from './types.js'

const BASE = '/api'

/** 同一会话的推送串行化：正在推送时再次写入只标记 dirty，结束后补推最新一份。 */
type PushState = { running: boolean; dirty: boolean; latest: Session | null }

const pushes = new Map<string, PushState>()

const request = async (input: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, init)
  if (!response.ok) throw new Error(`${init?.method || 'GET'} ${input} -> ${response.status}`)
  return response
}

const pushNow = async (session: Session): Promise<void> => {
  await request(`${BASE}/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  })
}

/** 推送一个会话；高频写入时合并为「最后一版」，但保证结束时服务端是最新数据。 */
export const pushSession = (session: Session): void => {
  const state = pushes.get(session.id) ?? { running: false, dirty: false, latest: null }
  state.latest = session
  pushes.set(session.id, state)
  if (state.running) {
    state.dirty = true
    return
  }
  state.running = true
  void (async () => {
    try {
      while (state.latest) {
        const target = state.latest
        state.latest = null
        state.dirty = false
        try {
          await pushNow(target)
        } catch (error) {
          console.warn('[sync] 会话保存失败，已保留本地副本', error)
          break
        }
        if (!state.dirty) break
      }
    } finally {
      state.running = false
      pushes.delete(session.id)
    }
  })()
}

/** 上传附件原件；失败不影响本地可用性。 */
export const pushFile = (id: string, blob: Blob): void => {
  void (async () => {
    try {
      await request(`${BASE}/files/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob,
      })
    } catch (error) {
      console.warn('[sync] 附件上传失败，已保留本地副本', error)
    }
  })()
}

export const deleteRemoteSession = (id: string): void => {
  void (async () => {
    try {
      await request(`${BASE}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch (error) {
      console.warn('[sync] 远端会话删除失败', error)
    }
  })()
}

export const listRemoteSessions = async (): Promise<SessionSummary[]> => {
  try {
    const response = await request(`${BASE}/sessions`)
    const data = (await response.json()) as SessionSummary[]
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.warn('[sync] 读取远端会话列表失败', error)
    return []
  }
}

export const getRemoteSession = async (id: string): Promise<Session | undefined> => {
  try {
    const response = await request(`${BASE}/sessions/${encodeURIComponent(id)}`)
    return (await response.json()) as Session
  } catch {
    return undefined
  }
}

export const getRemoteFile = async (id: string): Promise<Blob | undefined> => {
  try {
    const response = await request(`${BASE}/files/${encodeURIComponent(id)}`)
    return await response.blob()
  } catch {
    return undefined
  }
}
