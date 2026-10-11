'use client'

import { useState } from 'react'
import { useLogin } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck, Eye, EyeOff, AlertCircle, Loader2, Server, Radio, MapPin } from 'lucide-react'
import { ApiRequestError } from '@/lib/api-client'
import { toast } from 'sonner'

const DEMO_ACCOUNTS = [
  { username: 'admin', role: 'Administrator', desc: 'Full access' },
  { username: 'dispatcher', role: 'Dispatcher', desc: 'Acknowledge & assign' },
  { username: 'tech', role: 'Node Technician', desc: 'Register & maintain nodes' },
  { username: 'field', role: 'Field Coordinator', desc: 'Update field status' },
  { username: 'viewer', role: 'Viewer', desc: 'Read-only' },
]

export function LoginPage() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('resqnet123')
  const [show, setShow] = useState(false)
  const login = useLogin()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('Enter your username and password.')
      return
    }
    login.mutate(
      { username, password },
      {
        onSuccess: (data) => {
          toast.success(`Welcome, ${data.user.display_name}.`)
        },
        onError: (err) => {
          if (err instanceof ApiRequestError) {
            if (err.status === 401) {
              toast.error('Invalid credentials. Try again.')
            } else if (err.status === 429) {
              toast.error('Too many attempts. Wait a minute and try again.')
            } else {
              toast.error(err.message)
            }
          } else {
            toast.error('Could not reach the gateway.')
          }
        },
      },
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--accent)/40,transparent_55%),radial-gradient(circle_at_75%_75%,var(--info)/15,transparent_50%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        {/* Left: brand / context */}
        <div className="hidden flex-col justify-between p-10 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">ResQNet</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Command Dashboard
              </div>
            </div>
          </div>

          <div className="max-w-md space-y-5">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Local-first disaster response coordination.
            </h1>
            <p className="text-base text-muted-foreground">
              Monitor rescue nodes, review SOS reports, dispatch teams, and manage
              local resources — even when the internet is unavailable.
            </p>
            <div className="grid gap-2.5 pt-2">
              {[
                { icon: Radio, label: 'Live node health & heartbeats' },
                { icon: Server, label: 'Audit trail for every operator action' },
                { icon: MapPin, label: 'Situation map with deployment references' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5 text-sm text-foreground/80">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            ResQNet v0.1.0 · Self-hosted on the Raspberry Pi gateway · No external dependencies
          </div>
        </div>

        {/* Right: form */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <Card className="w-full max-w-sm border-border/60 shadow-xl">
            <CardHeader className="space-y-2 text-center">
              {/* Mobile brand */}
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow lg:hidden">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">Operator sign-in</CardTitle>
              <CardDescription>
                Authenticate to access the local command dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin"
                    disabled={login.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {show ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={show ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={login.isPending}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {login.isError && (
                  <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {login.error instanceof ApiRequestError
                      ? login.error.message
                      : 'Could not reach the gateway.'}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={login.isPending}>
                  {login.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating…
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>

              <div className="mt-5 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Demo accounts · password resqnet123
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.username}
                      type="button"
                      onClick={() => {
                        setUsername(a.username)
                        setPassword('resqnet123')
                      }}
                      className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                    >
                      <span className="font-mono">{a.username}</span>
                      <span className="text-muted-foreground">{a.role}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
