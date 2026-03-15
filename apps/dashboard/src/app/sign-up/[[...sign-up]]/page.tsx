import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1e1e2e' }}>
      <SignUp />
    </div>
  )
}
