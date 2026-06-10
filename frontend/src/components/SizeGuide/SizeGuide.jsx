import { motion, AnimatePresence } from 'framer-motion'
import { FiX } from 'react-icons/fi'
import styles from './SizeGuide.module.css'

const sizeTable = [
  { br: '35', us: '5', uk: '4', cm: '22.5' },
  { br: '36', us: '6', uk: '4.5', cm: '23' },
  { br: '37', us: '6.5', uk: '5', cm: '23.5' },
  { br: '38', us: '7', uk: '5.5', cm: '24' },
  { br: '39', us: '8', uk: '6', cm: '25' },
  { br: '40', us: '8.5', uk: '7', cm: '25.5' },
  { br: '41', us: '9', uk: '7.5', cm: '26' },
  { br: '42', us: '10', uk: '8.5', cm: '26.5' },
  { br: '43', us: '10.5', uk: '9', cm: '27' },
  { br: '44', us: '11', uk: '9.5', cm: '28' },
  { br: '45', us: '12', uk: '10', cm: '28.5' },
]

export default function SizeGuide({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className={styles.modal} initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }} onClick={e => e.stopPropagation()}>
            <div className={styles.header}>
              <h3 className={styles.title}>Guia de Tamanhos</h3>
              <button className={styles.closeBtn} onClick={onClose}><FiX /></button>
            </div>

            <p className={styles.tip}>💡 Dica: meça seu pé em cm e compare com a coluna CM abaixo.</p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>BR</th>
                    <th>US</th>
                    <th>UK</th>
                    <th>CM</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeTable.map(row => (
                    <tr key={row.br}>
                      <td><strong>{row.br}</strong></td>
                      <td>{row.us}</td>
                      <td>{row.uk}</td>
                      <td>{row.cm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.howTo}>
              <h4>Como medir?</h4>
              <ol>
                <li>Coloque o pé em uma folha de papel e marque o ponto mais longo.</li>
                <li>Meça com régua da borda até a marca.</li>
                <li>Compare o resultado com a coluna CM acima.</li>
              </ol>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
