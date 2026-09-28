import { describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@/core/data/memory-repo'
import type { Repo } from '@/core/data/repo'
import { PURGE_GRACE_DAYS, purgeDeletedUsers } from '@/core/privacy/purge'

const DAY = 86_400_000

async function seed(repo: Repo, id: string) {
  await repo.users.upsert({ clerkUserId: id, email: `${id}@test.dev` })
  await repo.profiles.upsert(id, 'remy', { firstName: 'Ana' }, 'active')
  await repo.notes.add(id, 'remy', 'aime le café')
  const conv = await repo.conversations.create(id, 'remy', 'Bonjour')
  await repo.messages.append({ id: `${id}-m1`, conversationId: conv.id, userId: id, appSlug: 'remy', role: 'user', parts: [{ type: 'text', text: 'bonjour' }] })
}

describe('purge des comptes supprimés', () => {
  it('la politique promet trente jours', () => {
    expect(PURGE_GRACE_DAYS).toBe(30)
  })

  it('un compte supprimé garde ses données pendant le délai, puis tout est effacé', async () => {
    const { repo } = createMemoryRepo()
    await seed(repo, 'u1')
    const deletedAt = new Date('2026-09-01T10:00:00Z')
    await repo.users.markDeleted('u1', deletedAt)

    const early = await purgeDeletedUsers(repo, new Date(deletedAt.getTime() + 10 * DAY))
    expect(early).toEqual({ purged: 0, failed: 0 })
    expect(await repo.notes.list('u1', 'remy', 10)).toHaveLength(1)

    const late = await purgeDeletedUsers(repo, new Date(deletedAt.getTime() + 31 * DAY))
    expect(late).toEqual({ purged: 1, failed: 0 })
    expect(await repo.notes.list('u1', 'remy', 10)).toHaveLength(0)
    expect(await repo.profiles.get('u1', 'remy')).toBeNull()
    expect(await repo.conversations.list('u1', 'remy', 10)).toHaveLength(0)
    expect(await repo.users.listToPurge(new Date('2100-01-01'), 10)).toHaveLength(0)
  })

  it('la purge est rejouable et ne touche pas les comptes vivants', async () => {
    const { repo } = createMemoryRepo()
    await seed(repo, 'gone')
    await seed(repo, 'alive')
    await repo.users.markDeleted('gone', new Date('2026-01-01'))
    const now = new Date('2026-09-18')
    expect(await purgeDeletedUsers(repo, now)).toEqual({ purged: 1, failed: 0 })
    expect(await purgeDeletedUsers(repo, now)).toEqual({ purged: 0, failed: 0 })
    expect(await repo.notes.list('alive', 'remy', 10)).toHaveLength(1)
    expect((await repo.users.get('alive'))?.email).toBe('alive@test.dev')
  })
})
