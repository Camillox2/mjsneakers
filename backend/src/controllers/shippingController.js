const shippingController = {
  async calculate(req, res) {
    try {
      const { cep } = req.body;
      if (!cep || cep.replace(/\D/g, '').length !== 8) {
        return res.status(400).json({ error: 'CEP inválido' });
      }

      const cleanCep = cep.replace(/\D/g, '');

      // Fetch address from ViaCEP
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const address = await response.json();

      if (address.erro) {
        return res.status(400).json({ error: 'CEP não encontrado' });
      }

      // Calculate shipping based on region
      const state = address.uf;
      const spStates = ['SP'];
      const seStates = ['RJ', 'MG', 'ES'];
      const sStates = ['PR', 'SC', 'RS'];
      const neStates = ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'];
      const coStates = ['GO', 'MT', 'MS', 'DF', 'TO'];
      const nStates = ['AM', 'PA', 'AC', 'RO', 'RR', 'AP'];

      let options = [];

      if (spStates.includes(state)) {
        options = [
          { type: 'PAC', price: 15.90, days: '3-5 dias úteis' },
          { type: 'SEDEX', price: 25.90, days: '1-2 dias úteis' },
          { type: 'Expresso', price: 39.90, days: '1 dia útil' }
        ];
      } else if (seStates.includes(state)) {
        options = [
          { type: 'PAC', price: 22.90, days: '5-8 dias úteis' },
          { type: 'SEDEX', price: 35.90, days: '2-3 dias úteis' }
        ];
      } else if (sStates.includes(state)) {
        options = [
          { type: 'PAC', price: 25.90, days: '5-8 dias úteis' },
          { type: 'SEDEX', price: 38.90, days: '2-4 dias úteis' }
        ];
      } else if (neStates.includes(state) || coStates.includes(state)) {
        options = [
          { type: 'PAC', price: 32.90, days: '8-12 dias úteis' },
          { type: 'SEDEX', price: 49.90, days: '3-5 dias úteis' }
        ];
      } else if (nStates.includes(state)) {
        options = [
          { type: 'PAC', price: 39.90, days: '10-15 dias úteis' },
          { type: 'SEDEX', price: 59.90, days: '5-7 dias úteis' }
        ];
      } else {
        options = [
          { type: 'PAC', price: 29.90, days: '7-10 dias úteis' },
          { type: 'SEDEX', price: 45.90, days: '3-5 dias úteis' }
        ];
      }

      res.json({
        cep: cleanCep,
        address: {
          street: address.logradouro,
          neighborhood: address.bairro,
          city: address.localidade,
          state: address.uf
        },
        options
      });
    } catch (error) {
      console.error('Shipping calc error:', error);
      res.status(500).json({ error: 'Erro ao calcular frete' });
    }
  }
};

module.exports = shippingController;
