import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/Primitives'

export function NotFoundPage() {
  return (
    <>
      {/*
        Every route needs exactly one h1 for document structure. Here it carries
        the status rather than repeating the message below it.
      */}
      <h1 className="sr-only absolute h-px w-px overflow-hidden">Page not found</h1>
      <Card className="mt-8">
        <EmptyState
          title="That page does not exist"
          description="The link may be out of date. Everything in Ledger is reachable from the navigation."
          action={
            <Link to="/">
              <Button variant="primary">Back to the dashboard</Button>
            </Link>
          }
        />
      </Card>
    </>
  )
}
