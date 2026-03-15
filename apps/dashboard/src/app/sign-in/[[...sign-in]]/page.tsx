import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1e1e2e' }}>
      <SignIn />
    </div>
  )
}
