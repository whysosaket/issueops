import { useState } from 'react'
import { useDeleteSkill, useSaveSkill, useSkill, useSkills } from '../api'
import { Button, Card, PageTitle } from '../components'

const NEW_SKILL_TEMPLATE = `---
name: my-skill
description: One sentence saying when a run should use this skill.
---

# my-skill

Instructions for the run...
`

function SkillEditor({ name, onDeleted }: { name: string; onDeleted: () => void }) {
  const { data: skill } = useSkill(name)
  const save = useSaveSkill()
  const remove = useDeleteSkill()
  const [draft, setDraft] = useState<string | null>(null)
  if (!skill) return <Card className="text-sm text-zinc-500">Loading…</Card>
  const content = draft ?? skill.content
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-zinc-100">{skill.name}</span>
          {skill.shipped && (
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
              shipped — `issueops init` restores the original
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            disabled={draft === null || save.isPending}
            onClick={() =>
              save.mutate({ name: skill.name, content }, { onSuccess: () => setDraft(null) })
            }
          >
            Save
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Delete skill "${skill.name}"?`)) {
                remove.mutate(skill.name, { onSuccess: onDeleted })
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        className="h-[28rem] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200 focus:border-indigo-500 focus:outline-none"
      />
      {save.isError && <p className="mt-2 text-sm text-red-400">{save.error.message}</p>}
      {save.isSuccess && draft === null && <p className="mt-2 text-sm text-emerald-400">Saved.</p>}
    </Card>
  )
}

function NewSkillForm({ onCreated }: { onCreated: (name: string) => void }) {
  const [name, setName] = useState('')
  const save = useSaveSkill()
  const valid = /^[a-z0-9][a-z0-9-]*$/.test(name)
  return (
    <Card>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="skill-name (lowercase, hyphens)"
          className="w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
        <Button
          disabled={!valid || save.isPending}
          onClick={() =>
            save.mutate(
              { name, content: NEW_SKILL_TEMPLATE.replace(/my-skill/g, name) },
              { onSuccess: () => onCreated(name) },
            )
          }
        >
          Create skill
        </Button>
      </div>
      {name && !valid && (
        <p className="mt-2 text-xs text-amber-400">
          Names are lowercase letters, digits, and hyphens.
        </p>
      )}
      {save.isError && <p className="mt-2 text-sm text-red-400">{save.error.message}</p>}
    </Card>
  )
}

export default function Skills() {
  const { data: skills } = useSkills()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Skills</PageTitle>
        <Button variant="ghost" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ New skill'}
        </Button>
      </div>
      <p className="-mt-2 text-sm text-zinc-400">
        Skills are playbooks every run can load. Shipped skills cover the standard cases; add your
        own for team- or stack-specific know-how. All of them mount into every run.
      </p>
      {creating && (
        <NewSkillForm
          onCreated={(name) => {
            setCreating(false)
            setSelected(name)
          }}
        />
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {skills?.map((skill) => (
            <button
              key={skill.name}
              type="button"
              onClick={() => setSelected(skill.name)}
              className={`block w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                selected === skill.name
                  ? 'border-indigo-500 bg-zinc-900'
                  : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-zinc-100">{skill.name}</span>
                {skill.shipped && <span className="text-[10px] text-indigo-300">shipped</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{skill.description}</p>
            </button>
          ))}
          {skills?.length === 0 && (
            <Card className="text-sm text-zinc-500">
              No skills installed — run <code>issueops init</code>.
            </Card>
          )}
        </div>
        <div>
          {selected ? (
            <SkillEditor name={selected} onDeleted={() => setSelected(null)} />
          ) : (
            <Card className="text-sm text-zinc-500">Select a skill to view or edit it.</Card>
          )}
        </div>
      </div>
    </div>
  )
}
