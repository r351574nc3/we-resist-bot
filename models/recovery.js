'use strict';

module.exports = (sequelize, DataTypes) => {
  // const encrypted_fields = EncryptedField(sequelize, key);
  var Recovery = sequelize.define('Recovery', {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    username: { type: DataTypes.STRING, unique: true },
    privateKey: DataTypes.STRING,
    publicKey: DataTypes.STRING,
    password: DataTypes.STRING,
    memo: DataTypes.STRING
  }, {
    classMethods: {
      associate: function(models) {
        // associations can be defined here
      }
    }
  });
  return Recovery;
};