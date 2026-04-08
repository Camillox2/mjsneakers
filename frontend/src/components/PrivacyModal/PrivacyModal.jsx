import { AnimatePresence, motion } from 'framer-motion'
import { FiX } from 'react-icons/fi'
import styles from './PrivacyModal.module.css'

export default function PrivacyModal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 40 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            <button className={styles.closeBtn} onClick={onClose}>
              <FiX />
            </button>

            <h2 className={styles.title}>Política de Privacidade</h2>

            <div className={styles.content}>
              <p>Última atualização: Março de 2026</p>

              <h3>1. Informações que Coletamos</h3>
              <p>
                A MJ Sneakers coleta informações pessoais fornecidas voluntariamente por você ao 
                realizar uma compra ou se cadastrar em nosso site. Essas informações podem incluir:
              </p>
              <ul>
                <li>Nome completo</li>
                <li>Endereço de e-mail</li>
                <li>Número de telefone</li>
                <li>Endereço de entrega</li>
                <li>Dados de pagamento (processados de forma segura por terceiros)</li>
              </ul>

              <h3>2. Como Utilizamos seus Dados</h3>
              <p>Seus dados pessoais são utilizados exclusivamente para:</p>
              <ul>
                <li>Processar e entregar seus pedidos</li>
                <li>Enviar confirmações e atualizações de pedidos</li>
                <li>Fornecer suporte ao cliente</li>
                <li>Melhorar nossos serviços e experiência do usuário</li>
                <li>Cumprir obrigações legais e regulatórias</li>
              </ul>

              <h3>3. Proteção de Dados (LGPD)</h3>
              <p>
                Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), 
                garantimos que seus dados pessoais são tratados com segurança e transparência. 
                Utilizamos medidas técnicas e organizacionais adequadas para proteger suas 
                informações contra acesso não autorizado, alteração, divulgação ou destruição.
              </p>

              <h3>4. Compartilhamento de Dados</h3>
              <p>
                Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros 
                para fins de marketing. Seus dados podem ser compartilhados apenas com:
              </p>
              <ul>
                <li>Transportadoras para entrega de produtos</li>
                <li>Processadores de pagamento certificados</li>
                <li>Autoridades competentes quando exigido por lei</li>
              </ul>

              <h3>5. Seus Direitos</h3>
              <p>Conforme a LGPD, você tem direito a:</p>
              <ul>
                <li>Confirmar a existência de tratamento de seus dados</li>
                <li>Acessar seus dados pessoais</li>
                <li>Solicitar a correção de dados incompletos ou desatualizados</li>
                <li>Solicitar a eliminação de dados desnecessários</li>
                <li>Revogar o consentimento a qualquer momento</li>
                <li>Solicitar a portabilidade dos dados</li>
              </ul>

              <h3>6. Cookies</h3>
              <p>
                Utilizamos cookies para melhorar sua experiência de navegação, lembrar suas 
                preferências e analisar o tráfego do site. Você pode configurar seu navegador 
                para recusar cookies, mas algumas funcionalidades podem ser afetadas.
              </p>

              <h3>7. Contato</h3>
              <p>
                Para exercer seus direitos ou esclarecer dúvidas sobre esta política, 
                entre em contato pelo e-mail: contato@mjsneakers.com.br
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
