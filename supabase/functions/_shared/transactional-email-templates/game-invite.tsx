/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, SITE, SITE_URL, SUPPORT_PHONE } from './_shared.ts'

interface Props {
  recipientName?: string
  inviteUrl?: string
  unsubscribeUrl?: string
}

const Email = ({ recipientName, inviteUrl = SITE_URL, unsubscribeUrl }: Props) => (
  <Html>
    <Head />
    <Preview>Test your driving skills in the DrivingKlass game, then tour the back parking lot</Preview>
    <Body style={brand.main}>
      <Container style={brand.container}>
        <Heading style={brand.h1}>Think you have 5 star driving skills?</Heading>
        <Text style={brand.text}>Hi {recipientName || 'there'},</Text>
        <Text style={brand.text}>
          Before the real road comes the challenge. {SITE} built a free driving game so you can test your
          focus, reaction time and decision making, right from your phone or computer.
        </Text>
        <Section style={brand.card}>
          <Text style={{ ...brand.text, margin: '0 0 8px' }}>
            <strong>1. Play the mini game.</strong> Open our homepage and test your skills behind the wheel.
          </Text>
          <Text style={{ ...brand.text, margin: '0 0 8px' }}>
            <strong>2. Visit the back parking lot.</strong> Tap the PARKING sign when it shows up on the homepage for a full
            walk through of every parking maneuver on the road test.
          </Text>
          <Text style={{ ...brand.text, margin: 0 }}>
            <strong>3. Request a full road test video.</strong> Send us a message from the homepage and we will get it to you.
          </Text>
        </Section>
        <Button style={brand.button} href={inviteUrl}>Play and explore now</Button>
        <Text style={{ ...brand.muted, margin: '20px 0 12px' }}>
          Questions? Reply to this email or call us at {SUPPORT_PHONE}.
        </Text>
        <Text style={brand.footer}>{SITE} • {SITE_URL}</Text>
        {unsubscribeUrl ? (
          <Text style={{ ...brand.muted, margin: '14px 0 0', fontSize: '12px' }}>
            You are getting this because you showed interest in {SITE}. <a href={unsubscribeUrl} style={{ color: '#6b7280' }}>Unsubscribe from game invites</a>.
          </Text>
        ) : null}
        <Text style={{ ...brand.text, textAlign: 'center' as const, fontWeight: 'bold' as const, color: '#b8860b', margin: '8px 0 0' }}>Where 5 star drivers are made</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => (d?.recipientName ? `${d.recipientName}, think you have 5 star driving skills?` : 'Think you have 5 star driving skills?'),
  displayName: 'Game invite',
  previewData: { recipientName: 'Quamie' },
  fromLocal: 'play',
  fromName: 'DrivingKlass Play',
  replyTo: 'connect@drivingklass.com',
} satisfies TemplateEntry
