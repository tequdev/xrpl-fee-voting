import { useEffect, useMemo, useState } from 'react'
import './App.css'

import { Client, dropsToXrp, xrpToDrops } from 'xrpl'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

let client: Client

const keys = ['base_fee', 'reserve_base', 'reserve_inc'] as const

interface ValidatorRegistryResponse {
  master_key: string
  chain: string // 'main'
  ephemeral_key: string
  last_seen: string
  ledger_index: number
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  meta: any
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  server_version: any
  votes: {
    amendments?: string[]
    base_fee?: number
    reserve_base?: number
    reserve_inc?: number
  }
  domain: string
  unl: string[]
  domain_legacy: string
}

const xrpscanValue = async () => {
  const url = 'https://api.xrpscan.com/api/v1/validatorregistry'
  const res = await fetch(url)
  const data = (await res.json()) as ValidatorRegistryResponse[]
  // get UNLs
  const unls = data.filter((v) => v.unl && v.unl.length > 0)
  return unls
}

const getCurrentLegerInfo = async () => {
  client = new Client('wss://xrpl.ws')
  await client.connect()
  const info = await client.request({
    command: 'server_info',
    validate: true,
  })
  await client.disconnect()
  const keys = ['base_fee', 'reserve_base', 'reserve_inc'] as const
  const values = keys.reduce(
    (prev, key) => {
      prev[key] = Number(
        xrpToDrops(info.result.info.validated_ledger![`${key}_xrp`]),
      )
      return prev
    },
    {} as { [key in 'base_fee' | 'reserve_base' | 'reserve_inc']: number },
  )
  return values
}

const parseValue = (value: number | string, key: (typeof keys)[number]) => {
  switch (key) {
    case 'base_fee':
      return Number(value)
    case 'reserve_base':
      return dropsToXrp(value)
    case 'reserve_inc':
      return dropsToXrp(value)
  }
}

const getUnit = (key: (typeof keys)[number]) => {
  switch (key) {
    case 'base_fee':
      return 'drops'
    case 'reserve_base':
      return 'XRP'
    case 'reserve_inc':
      return 'XRP'
  }
}

function App() {
  const [serverInfo, setServerInfo] = useState<
    { [key in 'base_fee' | 'reserve_base' | 'reserve_inc']: number } | null
  >(null)
  const [unls, setUnls] = useState<ValidatorRegistryResponse[]>([])

  useEffect(() => {
    const f = async () => {
      const [info, unls] = await Promise.all([
        getCurrentLegerInfo(),
        xrpscanValue(),
      ])
      console.log(info, unls)
      setServerInfo(info)
      setUnls(unls)
    }
    f()
  }, [])

  const votings = useMemo(() => {
    if (!serverInfo || !unls) return undefined
    const votings = keys.reduce(
      (prev, key) => {
        prev[key] = unls
          .map((v) => ({
            name: v.domain || v.domain_legacy,
            key: v.master_key,
            current: parseValue(serverInfo[key], key),
            voting: parseValue(v.votes[key] ?? serverInfo[key], key),
          }))
          .sort((a, b) => {
            if (a.voting === b.voting) {
              return a.key.localeCompare(b.key)
            }
            return a.voting > b.voting ? 1 : -1
          })
        return prev
      },
      {} as {
        [key in 'base_fee' | 'reserve_base' | 'reserve_inc']: {
          name: string
          key: string
          current: number
          voting: number
        }[]
      },
    )
    return votings
  }, [serverInfo, unls])

  return (
    <>
      <h1>XRPL Fee Voting</h1>
      <div>
        {keys.map((key) => (
          <div key={key}>
            <h2 style={{ marginBottom: '0.2rem' }}>
              {key === 'base_fee'
                ? 'Base Fee'
                : key === 'reserve_base'
                  ? 'Base Reserve'
                  : 'Increment Reserve'}
            </h2>
            <h3 style={{ marginTop: '0.2rem' }}>
              Current:{' '}
              {serverInfo
                ? `${parseValue(serverInfo[key], key)} ${getUnit(key)}`
                : ''}
            </h3>
            <ResponsiveContainer width={640} height={300}>
              <BarChart
                width={500}
                height={300}
                data={votings ? votings[key] : []}
                margin={{
                  top: 20,
                  right: 30,
                  left: 20,
                  bottom: 30,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                {/* <Bar dataKey="current" stackId="a" fill="#8884d8" /> */}
                <Bar dataKey="voting" stackId="a" fill="#82ca9d" />
                {votings && (
                  <ReferenceLine
                    y={votings[key][0].current}
                    stroke="red"
                    strokeWidth={1.5}
                    strokeOpacity={0.65}
                  />
                )}
                {votings && (
                  <ReferenceLine
                    x={
                      votings[key][Math.ceil(votings[key].length / 2) - 1].name
                    }
                    label={{
                      position: 'top',
                      value: '50%',
                    }}
                    stroke="red"
                    strokeWidth={1}
                    strokeOpacity={0.65}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </>
  )
}

export default App
